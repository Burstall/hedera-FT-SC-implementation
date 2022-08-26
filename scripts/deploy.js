const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateFlow,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	AccountInfoQuery,
	ContractInfoQuery,
	TokenId,
} = require('@hashgraph/sdk');
const fs = require('fs');
// const { hethers } = require('@hashgraph/hethers');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const tokenName = process.env.TOKEN_NAME;
const tokenSymbol = process.env.TOKEN_SYMBOL;
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);
const tokenInitalSupply = Number(process.env.TOKEN_INITALSUPPLY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = new ContractCreateFlow().setBytecode(bytecode).setGas(gasLim);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	const contractId = contractCreateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();
	return [contractId, contractAddress];
}

const main = async () => {

	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json'));

	const contractBytecode = json.bytecode;

	console.log('\n- Deploying contract...');
	const gasLimit = 100000;

	const [contractId, contractAddress] = await contractDeployFcn(contractBytecode, gasLimit);

	console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

	// Create FT using precompile function
	const createToken = new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(300000)
		.setPayableAmount(20)
		.setFunction('createFungible',
			/*
			*	FT NAME
			*	FT SYMBOL
			*	FT Initial Supply
			*	FT Decimals
			*	FT auto renew periood
			*/
			new ContractFunctionParameters()
				.addString(tokenName)
				.addString(tokenSymbol)
				.addUint256(tokenInitalSupply)
				.addUint256(tokenDecimal)
				.addUint32(7000000));

	const createTokenTx = await createToken.execute(client);

	const createTokenRx = await createTokenTx.getRecord(client);
	const tokenIdSolidityAddr = createTokenRx.contractFunctionResult.getAddress(0);
	const tokenId = TokenId.fromSolidityAddress(tokenIdSolidityAddr);

	console.log(`Token created with ID: ${tokenId} / ${tokenIdSolidityAddr}\n`);

	console.log('Using token: ', tokenId.toString());
	console.log('Using contract: ', contractId.toString());
	console.log('Using operator: ', operatorId.toString());

	const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId, tokenId);
	const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId, tokenId);

	console.log('operatorId',
		operatorId.toString(),
		'balance:',
		acctTokenBal,
		' -> ',
		accountHbarBal.toString());
	console.log('contract: ',
		contractId.toString(),
		'balance:',
		contractTokenBal,
		' -> ',
		contractHbarBal.toString());
};

async function getAccountBalance(acctId, tokenId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	try {
		if (tokenMap) {
			balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
		}
		else {
			balance = -1;
		}
	}
	catch {
		balance = -1;
	}

	return [balance, info.balance];
}

async function getContractBalance(ctrctId, tokenId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);
	let balance;
	const tokenMap = info.tokenRelationships;
	if (tokenMap) {
		balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
