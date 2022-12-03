import dotenv from 'dotenv';
dotenv.config();
import { AccountId, PrivateKey, Client, AccountBalanceQuery, TokenMintTransaction, TokenId } from '@hashgraph/sdk';

// Configure accounts and client, and generate needed keys
const myAcctID = AccountId.fromString(process.env.ACCOUNT_ID);
const myAcctPK = PrivateKey.fromString(process.env.PRIVATE_KEY);

const tokenId = TokenId.fromString(process.env.FT_TOKEN_ID);

const supplyKey = PrivateKey.fromString(process.env.FT_SUPPLY_KEY);


function getArg(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);
	let customValue;

	if (customIndex > -1) {
		// Retrieve the value after --custom
		customValue = process.argv[customIndex + 1];
	}

	return customValue;
}

function getArgFlag(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);

	if (customIndex > -1) {
		return true;
	}

	return false;
}


async function main() {

	if (getArgFlag('h')) {
		console.log('Usage: node mintAdditionalFungibleTokens.mjs [-mainnet] -supply XXX');
		return;
	}

	let client;

	if (getArgFlag('mainnet')) {
		console.log('using mainnet');
		client = Client.forMainnet();
	}
	else {
		console.log('Using testnet');
		client = Client.forTestnet();
	}
	let supply = 0;
	if (getArgFlag('supply')) {
		supply = Number(getArg('supply'));
		if (!Number.isInteger(supply)) {
			console.log('-supply need an integer argument..exiting');
			return;
		}
	}
	else {
		console.log('Must specify the supply to mint');
		return;
	}

	client.setOperator(myAcctID, myAcctPK);

	// CREATE FUNGIBLE TOKEN (STABLECOIN)
	const tokenMintTx = new TokenMintTransaction()
		.setTokenId(tokenId)
		.setAmount(supply)
		.freezeWith(client);

	console.log(`Creating supply of ${supply} for ${tokenId}`);

	const tokenMintSign = await tokenMintTx.sign(supplyKey);
	const tokenMintSubmit = await tokenMintSign.execute(client);
	const tokenMintRx = await tokenMintSubmit.getReceipt(client);
	console.log('result:', tokenMintRx.status.toString());

	// BALANCE CHECK
	const balanceCheckTx = await new AccountBalanceQuery().setAccountId(myAcctID).execute(client);
	console.log(`- Treasury balance: ${balanceCheckTx.tokens._map.get(tokenId.toString())} units of token ID ${tokenId}`);
}


main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});