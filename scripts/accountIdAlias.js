const {
	AccountId,
} = require('@hashgraph/sdk');
const exit = require('node:process');


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
	const help = getArgFlag('h');
	if (help) {
		console.log('Usage: node accountIdAlias.js [-string | -solidity] XXXXX');
		console.log('       -string		used if the address is in shard/realm/account format -> 0.0.XXXX');
		console.log('		-solidity	used if the address is in solidity EVM format');
		exit(0);
	}

	let accountId;
	if (getArgFlag('string')) {
		accountId = AccountId.fromString(getArg('string'));
	}
	else if (getArgFlag('solidity')) {
		accountId = AccountId.fromSolidityAddress(getArg('solidity'));
	}

	console.log('Account: ' + accountId.toString() +
				'\nSolidity Address: ' + accountId.toSolidityAddress());
}

main();