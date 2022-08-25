const artifacts = require('artifacts.contracts');

const { expect } = require('chai');
const { describe, beforeEach, it } = require('mocha');

// Import utilities from Test Helpers
const { expectRevert } = require('@openzeppelin/test-helpers');

// Load compiled artifacts
const FungibleTokenCreator = artifacts.require('FungibleTokenCreator');

// Start test block
describe('FungibleTokenCreator', function([ owner, other ]) {

	beforeEach(async function() {
		this.ftc = await FungibleTokenCreator.new({ from: owner });
	});

	it('mints a new fungible token', async function() {
		/*
		string memory name,
        string memory symbol,
        uint initialSupply,
        uint decimals,
        uint32 autoRenewPeriod
		*/
		await this.ftc.createFungible('test', 'tst', 100000, 2, { from: owner });


		// expect(await this.ftc.retrieve()).to.be.bignumber.equal(20);
	});

	it('transfers the created FT to treasury account', async function() {

		// expect(await this.ftc.retrieve()).to.be.bignumber.equal(value);
	});

	it('non owner cannot transfer tokens', async function() {
		// Test a transaction reverts
		await expectRevert(
			// (address token, address recipient, uint256 amount
			this.ftc.transfer('', { from: other }),
			'Ownable: caller is not the owner',
		);
	});
});