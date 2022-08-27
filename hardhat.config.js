require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: '0.8.9',
	gasReporter: {
		enabled: true,
		currency: 'USD',
	},
};