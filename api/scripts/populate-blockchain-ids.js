#!/usr/bin/env node

/**
 * Utility script to populate missing blockchain IDs for existing users
 * This script should be run when users are missing their blockchain IDs
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { User } = require('../src/models');
const { evaluateTransaction } = require('../src/utils/blockchainUtils');

const populateBlockchainIds = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('Connected to MongoDB');

    // Find users without blockchain IDs
    const usersWithoutBlockchainId = await User.find({
      $or: [
        { blockchainId: { $exists: false } },
        { blockchainId: null },
        { blockchainId: '' }
      ]
    });

    console.log(`Found ${usersWithoutBlockchainId.length} users without blockchain IDs`);

    let successCount = 0;
    let failureCount = 0;

    for (const user of usersWithoutBlockchainId) {
      try {
        console.log(`Fetching blockchain ID for user: ${user.email}`);
        
        // Determine org based on user role
        const orgName = user.role === 'doctor' ? 'org1' : 'org1'; // Adjust as needed
        
        const idBuffer = await evaluateTransaction(orgName, user.email, 'getMyId');
        const blockchainId = idBuffer.toString();
        
        if (blockchainId) {
          user.blockchainId = blockchainId;
          await user.save();
          console.log(`✅ Updated blockchain ID for ${user.email}: ${blockchainId}`);
          successCount++;
        } else {
          console.log(`❌ Empty blockchain ID returned for ${user.email}`);
          failureCount++;
        }
      } catch (error) {
        console.log(`❌ Failed to fetch blockchain ID for ${user.email}:`, error.message);
        failureCount++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`✅ Successfully updated: ${successCount} users`);
    console.log(`❌ Failed to update: ${failureCount} users`);

  } catch (error) {
    console.error('Error populating blockchain IDs:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script if called directly
if (require.main === module) {
  populateBlockchainIds()
    .then(() => {
      console.log('Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { populateBlockchainIds };