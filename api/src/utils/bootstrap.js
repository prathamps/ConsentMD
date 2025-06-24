const config = require('../config/config');
const Organization = require('../models/organization.model');
const User = require('../models/user.model');
const { ORG_ORGANIZATION, USER_STATUS, USER_TYPE } = require('./Constants');
const { registerUser } = require('./blockchainUtils');

const ingestBootstrapData = async () => {
  const staticOrgData = [
    { name: 'Org1', id: 1, parentId: 1 },
    { name: 'Org2', id: 2, parentId: 1 },
  ];
  const staticUser = [
    {
      name: 'prathamps',
      email: 'admin100@gmail.com',
      orgId: 1,
      password: config.commonPassword, 
      organization: ORG_ORGANIZATION.DOCTOR,
    },
    {
      name: 'pspratham',
      email: 'admin101@gmail.com',
      orgId: 2,
      password: config.commonPassword, 
      organization: ORG_ORGANIZATION.PATIENT,
    },
  ];
  //org data
  for (let org of staticOrgData) {
    let orgData = await Organization.findOne({ id: org.id });
    if (!orgData) {
      let o = new Organization({
        id: org.id,
        name: org.name,
        parentId: org.parentId,
      });
      await o.save();
      console.log('Ingesting static org data', org.name);
    } else {
      console.log('organization already exist', org.name);
    }
  }

  //user data
  for (let user of staticUser) {
    let userData = await User.findOne({ email: user.email });
    // console.log('user data is---', userData);
    if (!userData) {
      let newUser = new User({
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        password: user.password,
        status: USER_STATUS.ACTIVE,
        type:USER_TYPE.ADMIN,
        organization: user.organization,
      });
      try {
          //Blockchain Registration and Enrollment call
          let secret = await registerUser(`org${user.orgId}`, user.email, user.organization);
          newUser.secret = secret
          newUser.isVerified = true
      } catch (error) {
        
      } 
      await newUser.save();

      console.log('----ingest static user data--', user.email);
    } else {
      console.log('user email already exist', user.email);
    }
  }
};

module.exports = { ingestBootstrapData };
