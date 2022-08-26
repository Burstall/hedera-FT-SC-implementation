// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

import './HederaResponseCodes.sol';
import './IHederaTokenService.sol';
import './HederaTokenService.sol';
import './ExpiryHelper.sol';

// Import Ownable from the OpenZeppelin Contracts library
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract FungibleTokenCreator is ExpiryHelper, Ownable {

    // create a fungible Token with no custom fees,
    function createFungible(
        string memory name,
        string memory symbol,
        uint initialSupply,
        uint decimals,
        uint32 autoRenewPeriod
    ) external payable returns (address createdTokenAddress) {

        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
        token.treasury = address(this);

        // create the expiry schedule for the token using ExpiryHelper
        token.expiry = createAutoRenewExpiry(address(this), autoRenewPeriod);

        // call HTS precompiled contract, passing initial supply and decimals
        (int responseCode, address tokenAddress) =
                    HederaTokenService.createFungibleToken(token, initialSupply, decimals);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }

        createdTokenAddress = tokenAddress;
    }

	function mintAdditionalSupply(uint64 amount) external onlyOwner 
		returns (int responseCode, uint64 newTotalSupply) {
		// function to mint additional supply
	}

	function burnSupply(address token, uint64 amount) external onlyOwner
		returns (int responseCode, uint64 newTotalSupply) {
		// create burn mechanism
		// access control: msg signer only
		// uses wipe key execute the burn

		// need to add an equivalent service but for now  test with burn by owner

		// call HTS precompiled contract, passing initial supply and decimals
        (responseCode, newTotalSupply) =
                    HederaTokenService.burnToken(token, amount, new int64[](0));

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
	}

	function burn(address token, uint64 amount) external {
			ERC20Burnable(token).burnFrom(msg.sender, amount);
	}

	function sendToken(
		address token, 
		address[] memory accountIds, 
		int64[] memory amounts
	) external onlyOwner 
		returns (int responseCode) {
		// function to send Tokens owned by the contract
	}

	function approveAllowance(
		address token, 
		address spender, 
		uint256 amount
	) public onlyOwner 
		returns (int responseCode) {
		// rather than move tokens can create an allowance to let another wallet spend on contracts behalf.
	}

	// Transfer token from this contract to the recipient
    function transfer(address token, address recipient, uint256 amount) external onlyOwner {
        IERC20(token).transfer(recipient, amount);
    }

    fallback () external{}

}