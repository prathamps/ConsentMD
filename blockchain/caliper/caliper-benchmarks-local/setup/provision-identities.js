#!/usr/bin/env node
"use strict"

/**
 * Provision CA-enrolled benchmark identities (reviewer items 7 and 8 hinge
 * on this being real: the chaincode is fail-closed on the `organization`
 * certificate attribute, so plain cryptogen identities are denied everywhere).
 *
 * Registers and enrolls
 *   bench_patient_<i> with organization=patient at the Org1 CA
 *   bench_doctor_<i>  with organization=doctor  at the Org2 CA
 * — the exact attribute scheme the production API uses (see
 * api/src/utils/blockchainUtils.js), writes the PEMs under
 * networks/fabric/bench-identities/, and generates
 * networks/fabric/bench-network.yaml for Caliper.
 *
 * Usage: node setup/provision-identities.js [--patients 20] [--doctors 10]
 * Env:   CA1_URL, CA2_URL (default https://localhost:7054 / :8054),
 *        CA_ADMIN / CA_ADMIN_SECRET (default admin / adminpw)
 *
 * Idempotent: re-running re-enrolls existing registrations.
 */

const fs = require("fs")
const path = require("path")
const FabricCAServices = require("fabric-ca-client")
const { patientIdentityName, doctorIdentityName } = require("../src/config")

const SUITE_ROOT = path.resolve(__dirname, "..")
const IDENTITIES_DIR = path.join(SUITE_ROOT, "networks/fabric/bench-identities")
const NETWORK_FILE = path.join(SUITE_ROOT, "networks/fabric/bench-network.yaml")
const CA_TLS_ROOT = path.resolve(
	SUITE_ROOT,
	"../../artifacts/channel/create-certificate-with-ca/fabric-ca"
)

const ORGS = [
	{
		key: "org1",
		mspId: "Org1MSP",
		caName: "ca.org1.example.com",
		caUrl: process.env.CA1_URL || "https://localhost:7054",
		tlsCert: path.join(CA_TLS_ROOT, "org1/tls-cert.pem"),
		connectionProfile: "./networks/fabric/connection-profiles/org1-connection-profile.yaml",
		role: "patient",
		nameFor: patientIdentityName,
		countFlag: "--patients",
		defaultCount: 20,
	},
	{
		key: "org2",
		mspId: "Org2MSP",
		caName: "ca.org2.example.com",
		caUrl: process.env.CA2_URL || "https://localhost:8054",
		tlsCert: path.join(CA_TLS_ROOT, "org2/tls-cert.pem"),
		connectionProfile: "./networks/fabric/connection-profiles/org2-connection-profile.yaml",
		role: "doctor",
		nameFor: doctorIdentityName,
		countFlag: "--doctors",
		defaultCount: 10,
	},
]

async function main() {
	const provisioned = {}
	for (const org of ORGS) {
		const count = flagValue(org.countFlag) ?? org.defaultCount
		provisioned[org.key] = await provisionOrg(org, count)
	}
	writeNetworkConfig(provisioned)
	console.log(`\nWrote ${NETWORK_FILE}`)
	console.log("Run benchmarks with: ./run-benchmarks.sh (uses bench-network.yaml)")
}

async function provisionOrg(org, count) {
	console.log(`\n[${org.key}] provisioning ${count} ${org.role} identities via ${org.caUrl}`)
	const ca = new FabricCAServices(
		org.caUrl,
		{ trustedRoots: readTlsCert(org.tlsCert), verify: false },
		org.caName
	)
	const registrar = await enrollRegistrar(ca)

	const identities = []
	let reused = 0
	for (let i = 0; i < count; i++) {
		const name = org.nameFor(i)
		const secret = `${name}pw`

		// Idempotent re-run: if this identity's cert+key are already on disk,
		// reuse them. This avoids a second CA enrollment, which the CA would
		// reject once maxEnrollments is reached.
		const existing = existingIdentity(org.key, name)
		if (existing) {
			identities.push(existing)
			reused++
			process.stdout.write(`\r[${org.key}] ${i + 1}/${count} (reused ${reused})`)
			continue
		}

		await registerTolerant(ca, registrar, {
			enrollmentID: name,
			enrollmentSecret: secret,
			role: "client",
			affiliation: "",
			// -1 = unlimited enrollments, so a later re-run (e.g. after the
			// local crypto is wiped but the CA's identity DB persists) can
			// re-enroll instead of failing with an authentication error.
			maxEnrollments: -1,
			// The attribute the chaincode's principalOf() reads; ecert:true
			// embeds it in the enrollment certificate itself.
			attrs: [{ name: "organization", value: org.role, ecert: true }],
		})
		const enrollment = await ca.enroll({
			enrollmentID: name,
			enrollmentSecret: secret,
			attr_reqs: [{ name: "organization", optional: false }],
		})
		identities.push(writeIdentity(org.key, name, enrollment))
		process.stdout.write(`\r[${org.key}] enrolled ${i + 1}/${count}`)
	}
	process.stdout.write("\n")
	return identities
}

/** Existing on-disk identity (cert+key), or null. Used for idempotent re-runs. */
function existingIdentity(orgKey, name) {
	const dir = path.join(IDENTITIES_DIR, orgKey, name)
	const certPath = path.join(dir, "cert.pem")
	const keyPath = path.join(dir, "key.pem")
	if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
		return { name, certPath, keyPath }
	}
	return null
}

async function enrollRegistrar(ca) {
	const enrollment = await ca.enroll({
		enrollmentID: process.env.CA_ADMIN || "admin",
		enrollmentSecret: process.env.CA_ADMIN_SECRET || "adminpw",
	})
	const { User } = require("fabric-common")
	const user = new User("registrar")
	await user.setEnrollment(enrollment.key, enrollment.certificate, "registrarMSP")
	return user
}

/** Register, treating "already registered" as success so re-runs work. */
async function registerTolerant(ca, registrar, request) {
	try {
		await ca.register(request, registrar)
	} catch (error) {
		if (!/already registered/i.test(error.message || "")) throw error
	}
}

function writeIdentity(orgKey, name, enrollment) {
	const dir = path.join(IDENTITIES_DIR, orgKey, name)
	fs.mkdirSync(dir, { recursive: true })
	const certPath = path.join(dir, "cert.pem")
	const keyPath = path.join(dir, "key.pem")
	fs.writeFileSync(certPath, enrollment.certificate)
	fs.writeFileSync(keyPath, enrollment.key.toBytes())
	return { name, certPath, keyPath }
}

function readTlsCert(tlsPath) {
	if (!fs.existsSync(tlsPath)) {
		console.warn(`  TLS cert not found at ${tlsPath}; connecting without pinned root`)
		return []
	}
	return [fs.readFileSync(tlsPath, "utf8")]
}

/** Caliper network config including every provisioned identity. */
function writeNetworkConfig(provisioned) {
	const identityBlock = (identities) =>
		identities
			.map(
				({ name, certPath, keyPath }) =>
					`        - name: "${name}"\n` +
					`          clientPrivateKey:\n` +
					`            path: "${path.relative(SUITE_ROOT, keyPath)}"\n` +
					`          clientSignedCert:\n` +
					`            path: "${path.relative(SUITE_ROOT, certPath)}"`
			)
			.join("\n")

	const yaml = `# GENERATED by setup/provision-identities.js — do not edit by hand.
# Identities carry the CA-issued \`organization\` attribute the chaincode
# requires; regenerate after recreating the network's crypto material.
name: ConsentMD Benchmark Network
version: "2.0.0"

caliper:
  blockchain: fabric

channels:
  - channelName: mychannel
    contracts:
      - id: medicalconsent
        version: "1.0"
        language: javascript
        path: ../../../../artifacts/chaincode/javascript

organizations:
${ORGS.map(
		(org) => `  - mspid: ${org.mspId}
    identities:
      certificates:
${identityBlock(provisioned[org.key])}
    connectionProfile:
      path: "${org.connectionProfile}"
      discover: true`
	).join("\n\n")}
`
	fs.writeFileSync(NETWORK_FILE, yaml)
}

function flagValue(flag) {
	const index = process.argv.indexOf(flag)
	if (index === -1 || index + 1 >= process.argv.length) return null
	const value = Number(process.argv[index + 1])
	return Number.isInteger(value) && value > 0 ? value : null
}

main().catch((error) => {
	console.error(`\nProvisioning failed: ${error.message}`)
	console.error(
		"Preflight: are the CA containers up (docker ps | grep ca.org) and is the network created?"
	)
	process.exit(1)
})
