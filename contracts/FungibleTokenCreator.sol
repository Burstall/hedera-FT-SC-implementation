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
import "@openzeppelin/contracts/utils/Strings.sol";

contract FungibleTokenCreator is ExpiryHelper, Ownable {
	using Bits for uint;

	event tokenControllerMessage(string msgType, address indexed from, uint amt, string message);

    // create a fungible Token with no custom fees,
	// with calling contract as admin key
	// add a wipe key in order to allow implmentation of burn function
	// => no additional mint, no pause

	/// @param maxSupply Set to 0 for an infinite token, set > 0 to enforce capped suply @ maxSupply
    function createFungibleWithBurn(
		// bytes memory ed25519Key,
        string memory name,
        string memory symbol,
		string memory memo,
        uint initialSupply,
        uint decimals,
		uint32 maxSupply
    ) external payable returns (address createdTokenAddress) {
		// instantiate the list of keys we'll use for token create
        // IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](2);
		IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);

		// keys[0] = createSingleKey(HederaTokenService.ADMIN_KEY_TYPE, KeyHelper.INHERIT_ACCOUNT_KEY, "");
		
		// create TokenKey of type wipeKey
        // uint wipeKeyType;
        // IHederaTokenService.KeyValue memory wipeKeyValue;
        // turn on bits corresponding to supply and pause key types
        // wipeKeyType = wipeKeyType.setBit(3);
        // set the value of the key to the ed25519Key passed as function arg
        // wipeKeyValue.ed25519 = ed25519Key;
        // keys[1] = IHederaTokenService.TokenKey (wipeKeyType, wipeKeyValue);
		keys[0] = createSingleKey(HederaTokenService.WIPE_KEY_TYPE, KeyHelper.CONTRACT_ID_KEY, address(this));

		// define the token
        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
		token.memo = memo;
        token.treasury = address(this);
		token.tokenKeys = keys;

		if (maxSupply > 0) {
			token.tokenSupplyType = false;
			token.maxSupply = maxSupply;
		}

        // create the expiry schedule for the token using ExpiryHelper
        token.expiry = createAutoRenewExpiry(address(this), HederaTokenService.defaultAutoRenewPeriod);

        // call HTS precompiled contract, passing initial supply and decimals
        (int responseCode, address tokenAddress) =
                    HederaTokenService.createFungibleToken(token, initialSupply, decimals);
	
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
	
		emit tokenControllerMessage("MINT", msg.sender, initialSupply, "Minted with supply key");

        createdTokenAddress = tokenAddress;
    }

	// create a fungible Token with no custom fees,
	// with calling contract as admin key
	// add a wipe key in order to allow implmentation of burn function
	// add a supply key to allow mint and burn in place
	// => no additional mint, no pause

	/// @param maxSupply Set to 0 for an infinite token, set > 0 to enforce capped suply @ maxSupply
	function createFungibleWithSupplyAndBurn(
		// bytes memory ed25519Key,
        string memory name,
        string memory symbol,
		string memory memo,
        uint initialSupply,
        uint decimals,
		uint32 maxSupply
    ) external payable returns (address createdTokenAddress) {

		// instantiate the list of keys we'll use for token create
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](2);

		/*
		keys[0] = createSingleKey(HederaTokenService.ADMIN_KEY_TYPE, KeyHelper.INHERIT_ACCOUNT_KEY, "");

		// create TokenKey of type wipeKey
        uint supplyWipeKeyType;
        IHederaTokenService.KeyValue memory supplyWipeKeyValue;
        // turn on bits corresponding to supply and wipe key types
        supplyWipeKeyType = supplyWipeKeyType.setBit(3);
		supplyWipeKeyType = supplyWipeKeyType.setBit(4);
        // set the value of the key to the ed25519Key passed as function arg
        supplyWipeKeyValue.ed25519 = ed25519Key;
        keys[1] = IHederaTokenService.TokenKey (supplyWipeKeyType, supplyWipeKeyValue);
		*/

		keys[0] = createSingleKey(HederaTokenService.WIPE_KEY_TYPE, KeyHelper.CONTRACT_ID_KEY, address(this));
		keys[1] = createSingleKey(HederaTokenService.SUPPLY_KEY_TYPE, KeyHelper.CONTRACT_ID_KEY, address(this));

		// define the token
        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
		token.memo = memo;
        token.treasury = address(this);
		token.tokenKeys = keys;

		if (maxSupply > 0) {
			token.tokenSupplyType = false;
			token.maxSupply = maxSupply;
		}
        // create the expiry schedule for the token using ExpiryHelper
        token.expiry = createAutoRenewExpiry(address(this), HederaTokenService.defaultAutoRenewPeriod);

        // call HTS precompiled contract, passing initial supply and decimals
        (int responseCode, address tokenAddress) =
                    HederaTokenService.createFungibleToken(token, initialSupply, decimals);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }

		emit tokenControllerMessage("MINT", msg.sender, initialSupply, "Success minting token with supply/wipe keys");

        createdTokenAddress = tokenAddress;
    }

	// mint an FT with no keys - not adjustable just clean and transparent
	function createTokenWithNoKeys(
		string memory name,
        string memory symbol,
		string memory memo,
        uint initialSupply,
        uint decimals,
		uint32 maxSupply
	) 	public payable returns (address createdTokenAddress) {
		//define the token
        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
		token.memo = memo;
        token.treasury = address(this);

		if (maxSupply > 0) {
			token.tokenSupplyType = false;
			token.maxSupply = maxSupply;
		}

		// create the expiry schedule for the token using ExpiryHelper
        token.expiry = createAutoRenewExpiry(address(this), HederaTokenService.defaultAutoRenewPeriod);

        (int responseCode, address tokenAddress) =
       		HederaTokenService.createFungibleToken(token, initialSupply, decimals);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }

		emit tokenControllerMessage("MINT", msg.sender, initialSupply, "Success minting token without keys");

        createdTokenAddress = tokenAddress;
    }

	function mintAdditionalSupply(address token, uint64 amount) external onlyOwner 
		returns (int responseCode, uint64 newTotalSupply) {
		
		bytes[] memory _metadata;

		(responseCode, newTotalSupply, ) =
                    HederaTokenService.mintToken(token, amount, _metadata);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
	}

	function burnFromTreasury(address token, uint64 amount) external payable onlyOwner
		returns (int responseCode, uint64 newTotalSupply) {
		
		int64[] memory _serials;

        (responseCode, newTotalSupply) =
                    HederaTokenService.burnToken(token, amount, _serials);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
	}

	/// Operation to wipe fungible tokens from caller's account
    /// @param token The token address
    /// @param amount The number of tokens to wipe
    /// @return responseCode The response code for the status of the request. SUCCESS is 22.
    function burn(address token, uint32 amount) external
        returns (int responseCode)
    {
        (responseCode) =
                    HederaTokenService.wipeTokenAccount(token, msg.sender, amount);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
		emit tokenControllerMessage("BURN", msg.sender, amount, "Burn complete");
    }

	/// Initiates a Fungible Token Transfer
    /// @param token The ID of the token as a solidity address
    /// @param accountIds account to do a transfer to/from
    /// @param amounts The amount from the accountId at the same index
	function batchTransferTokens(
		address token, 
		address[] memory accountIds, 
		int64[] memory amounts
	) external onlyOwner 
		returns (int responseCode) {
		// TODO: add check that contracts owns enough to fulfill?

		(responseCode) =
                    HederaTokenService.transferTokens(token, accountIds, amounts);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert ();
        }
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
    function transfer(
		address token, 
		address recipient,
		uint256 amount
	) external onlyOwner 
		returns (bool sent) {
        sent = IERC20(token).transfer(recipient, amount);
		require(sent, "Failed to transfer Tokens");
    }

	function callHbar(
		address payable _receiverAddress, 
		uint _amount
	) external onlyOwner 
		returns (bool sent){
        (sent, ) = _receiverAddress.call{value:_amount}("");
        require(sent, "Failed to send Hbar");
    }

	// allows the contract top recieve HBAR

    receive() external payable {}

    fallback() external payable {}

}

library Bits {

    uint constant internal ONE = uint(1);

    // Sets the bit at the given 'index' in 'self' to '1'.
    // Returns the modified value.
    function setBit(uint self, uint8 index) internal pure returns (uint) {
        return self | ONE << index;
    }
}