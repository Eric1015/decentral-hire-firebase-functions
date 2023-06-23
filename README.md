# Decentral Hire Firebase Functions

This repository provides the event processing logics to support the Dapp of Decentral Hire ([repo link](https://github.com/Eric1015/DecentralHire)).

## Setup

```shell
cd functions

npm install

npm run deploy

# if the deployment failed and you would like to see the detailed logs, run the following command
npm run deploy -- --debug
```

## Trouble Shooting

* If you see the following error while deployment, you will have to create the Realtime Database in the Firebase console.

```
Error: Failed to load function definition from source: Failed to generate manifest from function source: Error: Missing expected firebase config value databaseURL, config is actually ...
```

* If you have changed the trigger of a function, firebase will generally reject the deployment, so you will have to delete the function in the Firebase console (or use the following command) and deploy again.

```shell
firebase functions:delete <function_name>
```
