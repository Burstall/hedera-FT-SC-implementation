FT issuance with a SC as treasury

Check-out the repo:

### install dependencies ###
npm install

### Setup .env file ###
TOKEN_NAME=
TOKEN_SYMBOL=
TOKEN_DECIMALS=
TOKEN_INITALSUPPLY=
TOKEN_MAXSUPPLY=0
##100 char limit for the memo
TOKEN_MEMO=''
####
## TEST or MAIN
ENVIRONMENT=
CONTRACT_NAME=FungibleTokenCreator
EVENT_NAME=TokenControllerMessage
####
ACCOUNT_ID=
PRIVATE_KEY=
####
TOKEN_ID=
## https://testnet.mirrornode.hedera.com/api/v1/tokens/
CONTRACT_ID=
## https://testnet.mirrornode.hedera.com/api/v1/contracts/


### launch unit tests - please use testnet details ###
npm run test

### interact wih deployed script ###
npm run deploy

## updates .env:
CONTRACT_ID=

## mint a FT with setting from .env
npm run mintToken

## updates .env:
TOKEN_ID=

## various interactions
npm run interact

## get logs (emitted events)
npm run logs

## decode last error on contract (args: testnet/mainnet and contract ID)
node scripts/decodeSmartContractError.js testnet 0.0.48280144

### deploy to mainnet
update .env for main
npm run deploy
npm run mintToken

### run solhint ###
npm run solhint