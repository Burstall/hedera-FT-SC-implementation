const {
	Client,
	AccountId,
	PrivateKey,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	TokenAssociateTransaction,
	AccountInfoQuery,
	TokenId,
	ContractId,
	ContractInfoQuery,
	ContractCallQuery,
	ReceiptStatusError,
	TransferTransaction,
	AccountCreateTransaction,
	Hbar,
	TransactionId,
} = require('@hashgraph/sdk');
// const { hethers } = require('@hashgraph/hethers');
require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
let abi;

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const tokenId = TokenId.fromString(process.env.TOKEN_ID);
const tokenIdSolidityAddr = tokenId.toSolidityAddress();
const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

const main = async () => {
	// import ABI
	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json', 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	console.log('\n -Creating dummy account...');
	const dummyActPk = PrivateKey.generateED25519();
	const dummyAcctId = await accountCreator(dummyActPk, 5);
	console.log('Associating the token to operator account');
	await associateTokenToAccount(dummyAcctId, dummyActPk);

	const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
	const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);

	console.log('Using token: ',
		tokenId.toString(),
		' / ', tokenId.toSolidityAddress(),
		'balance:',
		acctTokenBal,
		' -> ',
		accountHbarBal.toString());
	console.log('Using contract: ',
		contractId.toString(),
		' / ', contractId.toSolidityAddress(),
		'balance:',
		contractTokenBal,
		' -> ',
		contractHbarBal.toString());

	if (acctTokenBal < 0) {
		// associate
		console.log('Associating the token to operator account');
		await associateTokenToAccount(operatorId, operatorKey);
	}

	// Execute token transfer from TokenSender to Operator
	await transferFungible(5);

	await transferFungibleWithHTS(5);


	// Execute burn (with wipe)
	await executeBurnWithWipe(4);

	// Execute mint additional supply
	await mintAdditionalSupply(7);

	await executeBurnWithSupply(11);

	// check the allowance WL
	await getAllowanceWL();

	// add an address to the allowance WL
	await addAddressToWL(operatorId);

	// check the allowance WL
	await getAllowanceWL();

	await checkIfWL(operatorId);

	// check the allowance WL
	await getAllowanceWL();

	// try to set allowance to a non WL account
	console.log('\n\n-Testing set allowance with no WL');
	await approveAllowance(dummyAcctId, 16, true);

	// test spending contracts tokens by operator with no approval.
	console.log('\n\n-Testing with no approval set');
	await testUsingApproval(contractId, operatorId, 19, dummyAcctId, dummyActPk, true);

	// check allowance -- should be zero
	console.log('\n\n-check allowance (should be zero)');
	await checkAllowance(dummyAcctId);

	// try to set allowance to a WL account
	console.log('\n\n-Testing set allowance **with WL**');
	await approveAllowance(operatorId, 19);

	// check allowance for an account
	console.log('\n\n-check allowance (should be as set above)');
	await checkAllowance(operatorId);

	console.log('\n\n-Testing with approval set');
	// test spending contracts tokens by operator to move token out.
	await testUsingApproval(contractId, operatorId, 19, operatorId, operatorKey);

	// test spending contracts tokens by operator with no approval.
	console.log('\n\n-Testing with approval *used up* -- expect fail');
	await testUsingApproval(contractId, operatorId, 1, operatorId, operatorKey, true);

	console.log('\n\n-Now test using an independent wallet');
	// add 3rd party wallet to WL
	await addAddressToWL(dummyAcctId);
	// set approval
	console.log('\n\n-Testing set allowance DUMMY **with WL**');
	await approveAllowance(dummyAcctId, 6);

	// check approval
	console.log('\n\n-DUMMY: check allowance (should be as set above)');
	await checkAllowance(dummyAcctId);

	// use approval
	console.log('\n\n-Testing with approval set - DUMMY Acct');
	// test spending contracts tokens by operator to move token out.
	await testUsingApproval(contractId, dummyAcctId, 5, dummyAcctId, dummyActPk);

	await testUsingApproval(contractId, operatorId, 1, dummyAcctId, dummyActPk);
	// remove 3rd party from WL
	await removeAddressFromWL(dummyAcctId);


	// remove address from allowance WL
	await removeAddressFromWL(operatorId);

	// check the allowance WL
	console.log('\n\n- WL should be empty');
	await getAllowanceWL();

	// try bulk transfer
	await bulkTransfer([operatorId, dummyAcctId, contractId], [2, 1, -3]);

	// send hbar to contract
	await sendHbarToContract(11);

	// move hbar from contract to operator
	// using low level call
	await callHbar(6);

	// transfer hbar from contract using higherleve call
	await transferHbarFromContract(5);
};

// eslint-disable-next-line no-unused-vars
async function bulkTransfer(accountList, amounts) {
	console.log('\n\n- Account balances...\n');

	const acctListEvmFormat = [];
	const int64List = [];

	if (accountList.length != amounts.length) {
		console.log('ERROR - please ensure accounts and amounts arrays match');
	}

	for (let a = 0; a < accountList.length; a++) {
		const account = accountList[a];
		const pmt = Number(amounts[a] * (10 ** tokenDecimal));
		if (account instanceof AccountId) {
			acctListEvmFormat.push(account.toSolidityAddress());
			int64List.push(pmt);
			const [acctTokenBal, accountHbarBal] = await getAccountBalance(account);
			console.log(account.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
		}
		else if (account instanceof ContractId) {
			acctListEvmFormat.push(account.toSolidityAddress());
			int64List.push(pmt);
			const [acctTokenBal, accountHbarBal] = await getContractBalance(account);
			console.log(account.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
		}
	}


	try {
		console.log('\n -Attempting batch transfer:', acctListEvmFormat, int64List);
		const gasLim = 800000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddressArray(acctListEvmFormat)
			.addInt64Array(int64List);
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'batchTransferTokens', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Executing batch transfer: ' + callHbarStatus.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}

	for (let a = 0; a < accountList.length; a++) {
		const account = accountList[a];
		if (account instanceof AccountId) {
			const [acctTokenBal, accountHbarBal] = await getAccountBalance(account);
			console.log(account.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
		}
		else if (account instanceof ContractId) {
			const [acctTokenBal, accountHbarBal] = await getContractBalance(account);
			console.log(account.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
		}
	}
}

/**
 * ?Function to test using approvals granted
 * @param {AccountId} from The account that owns the tokens
 * @param {AccountId} to The account receiving the tokens
 * @param {Number} amount amount of token to send
 * @param {AccountId} authSpender the account ofd the authorised spender who must create the tx ID & sign
 * @param {PrivateKey} authSpenderKey the key to sign with.
 * @param {boolean} failureExpected flag to state if we expect failure on the call
 */
// eslint-disable-next-line no-unused-vars
async function testUsingApproval(from, to, amount, authSpender, authSpenderKey, failureExpected = false) {
	// check balances
	let [acctTokenBal, accountHbarBal] = await getAccountBalance(to);
	let [contractTokenBal, contractHbarBal] = await getContractBalance(from);

	console.log('\n\n\t*PRE* Execution');
	console.log(to.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
	console.log(from.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());

	console.log('Transfer:', amount, 'of', tokenId.toString(), 'from', from.toString(), 'to', to.toString(), ' by authorised spender ', authSpender.toString());
	// transfer
	try {
		const transferTx = new TransferTransaction()
			.addApprovedTokenTransfer(tokenId, from, -amount * (10 ** tokenDecimal))
			.addTokenTransfer(tokenId, to, amount * (10 ** tokenDecimal))
			// signing account must generate the tx ID (currently undocumented - raised with hedera)
			.setTransactionId(TransactionId.generate(authSpender))
			.setTransactionMemo('Spending with allowances')
			.freezeWith(client);
		const transferSign = await transferTx.sign(authSpenderKey);
		const transferSubmit = await transferSign.execute(client);
		const transferRx = await transferSubmit.getReceipt(client);
		const tokenTransferStatus = transferRx.status;
		console.log('Allowance spending status: ' + tokenTransferStatus.toString());

		[acctTokenBal, accountHbarBal] = await getAccountBalance(to);
		[contractTokenBal, contractHbarBal] = await getContractBalance(from);
	}
	catch (err) {
		if (failureExpected && err instanceof ReceiptStatusError && err.status._code == 7) {
			console.log('Failed as expected - invalid signature', JSON.stringify(err, null, 2));
		}
		else if (failureExpected && err instanceof ReceiptStatusError && err.status._code == 292) {
			console.log('Failed as expected - SPENDER_DOES_NOT_HAVE_ALLOWANCE', JSON.stringify(err, null, 2));
		}
		else {
			console.log(err.status, err);
		}
	}
	console.log('\n\n\tPost Execution');
	console.log(to.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());
	console.log(from.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
}

// eslint-disable-next-line no-unused-vars
async function approveAllowance(spender, amount, failureExpected = false) {
	try {
		console.log('\n -Attempting *SET* allowance for ', amount, ' of ', tokenIdSolidityAddr, ' / ', tokenId.toString(), ' on ', spender.toString(), spender.toSolidityAddress());
		const gasLim = 800000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddress(spender.toSolidityAddress())
			.addUint256(amount * (10 ** tokenDecimal));
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'approveAllowance', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Setting allowance: ' + callHbarStatus.toString());
	}
	catch (err) {
		if (failureExpected && err instanceof ReceiptStatusError) {
			console.log('Failed to Approve Allowance as expected', JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

/**
 * Helper method to check the allowance on an account
 * @param {AccountId} spender check allowance for this potential spender
 */
// eslint-disable-next-line no-unused-vars
async function checkAllowance(spender, excpectedAmount = null) {
	try {
		console.log('\n -Attempting *CHECK* allowance for:', spender.toString(), spender.toSolidityAddress());
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddress(spender.toSolidityAddress());
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'checkAllowance', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		const allowance = contractOutput.amount;
		if (excpectedAmount === null) {
			console.log('Checking on allowance: ' + callHbarStatus.toString(), allowance);
		}
		else if (allowance == excpectedAmount) {
			console.log('Confirmed - allowance as expected', allowance);
		}
		else {
			console.log('BUG - allowance *NOT* as expected', allowance, excpectedAmount * (10 ** tokenDecimal));
		}
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

// eslint-disable-next-line no-unused-vars
async function addAddressToWL(address) {
	try {
		console.log('\n -Attempting to *ADD* to WL:', address.toString(), address.toSolidityAddress());
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(address.toSolidityAddress());
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'addAllowanceWhitelist', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Addition to allow WL: ' + callHbarStatus.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

// eslint-disable-next-line no-unused-vars
async function removeAddressFromWL(address) {
	try {
		console.log('\n -Attempting to **REMOVE* to WL:', address.toString(), address.toSolidityAddress());
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(address.toSolidityAddress());
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'removeAllowanceWhitelist', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Removal from WL: ' + callHbarStatus.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

// eslint-disable-next-line no-unused-vars
async function checkIfWL(address) {
	try {
		console.log('\n-isAddressWL Query', address.toString(), address.toSolidityAddress());
		// generate function call with function name and parameters
		const functionCallAsUint8Array = encodeFunctionCall('isAddressWL', [address.toSolidityAddress()]);

		// query the contract
		const contractCall = await new ContractCallQuery()
			.setContractId(contractId)
			.setFunctionParameters(functionCallAsUint8Array)
			.setMaxQueryPayment(new Hbar(2))
			.setGas(100000)
			.execute(client);

		const results = decodeFunctionResult('isAddressWL', contractCall.bytes);
		console.log('RESULTS:', results);
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

// eslint-disable-next-line no-unused-vars
async function getAllowanceWL() {
	try {
		console.log('\n-getAllowanceWhitelist Query');
		// generate function call with function name and parameters
		const functionCallAsUint8Array = encodeFunctionCall('getAllowanceWhitelist', []);

		// query the contract
		const contractCall = await new ContractCallQuery()
			.setContractId(contractId)
			.setFunctionParameters(functionCallAsUint8Array)
			.setMaxQueryPayment(new Hbar(2))
			.setGas(100000)
			.execute(client);

		const results = decodeFunctionResult('getAllowanceWhitelist', contractCall.bytes);
		const wlAccountsEVM = results.wl;
		if (wlAccountsEVM.length == 0) {
			console.log('No accounts in the WL!');
		}
		else {
			for (let a = 0; a < wlAccountsEVM.length; a++) {
				const acctAsEVM = wlAccountsEVM[a];
				console.log('\tFound account:', acctAsEVM, ' / ', AccountId.fromSolidityAddress(acctAsEVM).toString());
			}
		}
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

// eslint-disable-next-line no-unused-vars
async function transferHbarFromContract(amount) {
	try {
		console.log('\n -Attempting to retrieve hbar from contract (transfer)');
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(operatorId.toSolidityAddress())
			.addUint256(amount * 1e8);
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'transferHbar', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Move hbar *FROM* contract: ' + callHbarStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

// eslint-disable-next-line no-unused-vars
async function callHbar(amount) {
	try {
		console.log('\n -Attempting to retrieve hbar from contract (call)');
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(operatorId.toSolidityAddress())
			.addUint256(amount * 1e8);
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'callHbar', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Move hbar *FROM* contract: ' + callHbarStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

// eslint-disable-next-line no-unused-vars
async function sendHbarToContract(amount) {
	try {
		console.log('\n -Attempting to send hbar to contract (Hedera JS SDK)..');
		const hbarTransferRx = await hbarTransferFcn(operatorId, contractId, amount);
		const tokenTransferStatus = hbarTransferRx.status;
		console.log('Hbar send *TO* contract status: ' + tokenTransferStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		console.log(JSON.stringify(err, null, 2), err);
	}
}

async function hbarTransferFcn(sender, receiver, amount) {
	const transferTx = new TransferTransaction()
		.addHbarTransfer(sender, -amount)
		.addHbarTransfer(receiver, amount)
		.freezeWith(client);
	const transferSign = await transferTx.sign(operatorKey);
	const transferSubmit = await transferSign.execute(client);
	const transferRx = await transferSubmit.getReceipt(client);
	return transferRx;
}

async function transferFungible(amount) {

	console.log('\n\nTransferring: ', amount, ' of ', tokenId.toString(), tokenIdSolidityAddr);
	console.log('To:', operatorId.toString(), operatorId.toSolidityAddress());

	try {
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddress(operatorId.toSolidityAddress())
			.addUint256(amount * (10 ** tokenDecimal));
		const [tokenTransferRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'transfer', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(tokenTransferRx, 3));
		const tokenTransferStatus = tokenTransferRx.status;

		console.log('Token transfer transaction status: ' + tokenTransferStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

async function transferFungibleWithHTS(amount) {

	console.log('\n\nTransferring: ', amount, ' of ', tokenId.toString(), tokenIdSolidityAddr);
	console.log('To:', operatorId.toString(), operatorId.toSolidityAddress());
	console.log('Using', contractId.toString(), contractId.toSolidityAddress());

	try {
		const gasLim = 600000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddress(operatorId.toSolidityAddress())
			.addInt64(amount * (10 ** tokenDecimal));
		const [tokenTransferRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'transferHTS', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(tokenTransferRx, 3));
		const tokenTransferStatus = tokenTransferRx.status;

		console.log('Token transfer transaction status: ' + tokenTransferStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

// eslint-disable-next-line no-unused-vars
async function executeBurnWithWipe(amount) {
	try {
		console.log('\n -Attempting Burn (wipe method)..');
		const gasLim = 500000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addUint32(amount * (10 ** tokenDecimal));
		const [burnTxRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'burn', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(burnTxRx, 3));
		const burnTxStatus = burnTxRx.status;

		console.log('Burn (wipe) request: ' + burnTxStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

// eslint-disable-next-line no-unused-vars
async function mintAdditionalSupply(amount) {
	try {
		console.log('\n -Attempting to mint additional supply..');
		const gasLim = 500000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addUint64(amount * (10 ** tokenDecimal));
		const [mintSupplyTxRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'mintAdditionalSupply', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(burnTxRx, 3));
		const mintSupplyTxStatus = mintSupplyTxRx.status;

		console.log('Mint supply request: ' + mintSupplyTxStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

// eslint-disable-next-line no-unused-vars
async function executeBurnWithSupply(amount) {
	try {
		console.log('\n -Attempting Burn (burn at treasury)..');
		const gasLim = 500000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addUint64(amount * (10 ** tokenDecimal))
			// added array here for testing - ideally removed given FT focus.
			.addInt64Array([1]);
		const [burnTxRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'burnFromTreasury', params);
		console.log('Function results', JSON.stringify(contractOutput, null, 3));
		// console.log('Receipt', JSON.stringify(burnTxRx, 3));
		const burnTxStatus = burnTxRx.status;

		console.log('Burn (supply) request: ' + burnTxStatus.toString());
		const [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		const [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

async function getAccountBalance(acctId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());
	try {
		if (tokenBal) {
			balance = tokenBal.balance * (10 ** -tokenDecimal);
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

async function getContractBalance(ctrctId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);

	let balance;

	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());
	if (tokenBal) {
		balance = tokenBal.balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.execute(client);

	// get the results of the function call;
	const record = await contractExecuteTx.getRecord(client);
	console.log('record bytes:', JSON.stringify(record.contractFunctionResult.bytes));
	console.log('Execution return', fcnName, JSON.stringify(contractExecuteTx, null, 3));

	record.contractFunctionResult.logs.forEach((log) => {
		if (log.data == '0x') return;

		// convert the log.data (uint8Array) to a string
		const logStringHex = '0x'.concat(Buffer.from(log.data).toString('hex'));

		// get topics from log
		const logTopics = [];
		log.topics.forEach((topic) => {
			logTopics.push('0x'.concat(Buffer.from(topic).toString('hex')));
		});

		// decode the event data
		const event = decodeEvent('TokenControllerMessage', logStringHex, logTopics.slice(1));

		if (event) {
			// output the from address stored in the event
			console.log(
				`${event.msgType}: '${AccountId.fromSolidityAddress(event.fromAddress).toString()}' : ${event.amount} : '${event.message}'`,
			);
		}
		else {
			console.log('ERROR decoding (part of) log message');
		}

	});

	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await contractExecuteTx.getReceipt(client);
	return [contractExecuteRx, contractResults];
}

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
function decodeFunctionResult(functionName, resultAsBytes) {
	const functionAbi = abi.find(func => func.name === functionName);
	const functionParameters = functionAbi.outputs;
	console.log(
		'\n -Decoding:',
		functionName,
		'\n -outputs expected:',
		JSON.stringify(functionParameters, null, 3));
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

function decodeEvent(eventName, log, topics) {
	const eventAbi = abi.find((event) => event.name === eventName && event.type === 'event');
	try {
		const decodedLog = web3.eth.abi.decodeLog(eventAbi.inputs, log, topics);
		return decodedLog;
	}
	catch (err) {
		// console.log('ERROR decoding event', eventName, log, topics, err.message);
	}
}

function encodeFunctionCall(functionName, parameters) {
	const functionAbi = abi.find((func) => func.name === functionName && func.type === 'function');
	const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
	return Buffer.from(encodedParametersHex, 'hex');
}

// Creates a new account
// eslint-disable-next-line no-unused-vars
async function accountCreator(privateKey, initialBalance) {
	const response = await new AccountCreateTransaction()
		.setInitialBalance(new Hbar(initialBalance))
		.setMaxAutomaticTokenAssociations(10)
		.setKey(privateKey.publicKey)
		.execute(client);
	const receipt = await response.getReceipt(client);
	console.log('Account created:', receipt.accountId.toString());
	return receipt.accountId;
}

async function associateTokenToAccount(account, key) {
	// now associate the token to the operator account
	const associateToken = await new TokenAssociateTransaction()
		.setAccountId(account)
		.setTokenIds([tokenId])
		.freezeWith(client)
		.sign(key);

	const associateTokenTx = await associateToken.execute(client);
	const associateTokenRx = await associateTokenTx.getReceipt(client);

	const associateTokenStatus = associateTokenRx.status;

	console.log('The associate transaction status: ' + associateTokenStatus.toString(), account.toString());
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
