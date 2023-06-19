# Decentral Hire Firebase Functions

This repository provides the event processing logics to support the Dapp of Decentral Hire ([repo link](https://github.com/Eric1015/DecentralHire)).

## Setup

```
cd functions

npm install

npm run deploy
```

## Trouble Shooting

If you see the following error while deployment, you will have to create the Realtime Database in the Firebase console.

```
Error: Failed to load function definition from source: Failed to generate manifest from function source: Error: Missing expected firebase config value databaseURL, config is actually ...
```
