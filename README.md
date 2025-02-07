<div align="center">

  <h1>NEAR Workspaces (TypeScript/JavaScript Edition)</h1>

  [![Project license](https://img.shields.io/badge/license-Apache2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
  [![Project license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Discord](https://img.shields.io/discord/490367152054992913?label=discord)](https://discord.gg/Vyp7ETM)
  [![NPM version](https://img.shields.io/npm/v/near-workspaces.svg?style=flat-square)](https://npmjs.com/near-workspaces)
  [![Size on NPM](https://img.shields.io/bundlephobia/minzip/near-workspaces.svg?style=flat-square)](https://npmjs.com/near-workspaces)

</div>

`NEAR Workspaces` is a library for automating workflows and writing tests for NEAR smart contracts. You can use it as is or integrate with test runner of your choise (AVA, Jest, Mocha, etc.). If you don't have a preference, we suggest you to use AVA.

Quick Start (without testing frameworks)
===========
To get started with `Near Workspaces` you need to do only two things:

1. Initialize a `Worker`.

    This will be used as the starting point for more workers soon.

   ```ts
   const worker = await Worker.init(async ({root}) => {
     const alice = await root.createSubAccount('alice');
     const contract = await root.createAndDeploy(
       'contract-account-name',
       'path/to/compiled.wasm'
     );
     return {alice, contract};
   });
   ```

   Let's step through this.

   1. `Worker.init` initializes a new [NEAR Sandbox](https://docs.near.org/docs/develop/contracts/sandbox) node/instance. This is essentially a mini-NEAR blockchain created just for this test. Each of these Sandbox instances gets its own data directory and port, so that tests can run in parallel.
   2. This blockchain also has a `root` user. Mainnet has `*.near`, testnet has `*.testnet`, and these tests have `*.${root.accountId}`. This account name is not currently `sandbox` but might be in the future. Since it doesn't matter, you can think of it as being called `sandbox` while you're still figuring things out.
   3. `root.createSubAccount` creates a new subaccount of `root` with the given name, for example `alice.sandbox`.
   4. `root.createAndDeploy` creates a new subaccount with the given name, `contract-account-name.sandbox`, then deploys the specified Wasm file to it.
   5. `path/to/compiled.wasm` will resolve relative to your project root. That is, the nearest directory with a `package.json` file, or your current working directory if no `package.json` is found. To construct a path relative to your test file, you can use `path.join(__dirname, '../etc/etc.wasm')` ([more info](https://nodejs.org/api/path.html#path_path_join_paths)).
   6. After `Worker.create` finishes running the function passed into it, it gracefully shuts down the Sandbox instance it ran in the background. However, it keeps the data directory around. That's what stores the state of the two accounts that were created (`alice` and `contract-account-name` with its deployed contract).
   7. `worker` contains a reference to this data directory, so that multiple tests can use it as a starting point.
   8. The object returned, `{alice, contract}`, will be passed along to subsequent tests.

2. Writing tests.

   `near-workspaces` is designed for concurrency. Here's a simple way to get concurrent runs using plain JS:

   ```ts
   import {strict as assert} from 'assert';

   await Promise.all([
     worker.fork(async ({alice, contract}) => {
       await alice.call(
         contract,
         'some_update_function',
         {some_string_argument: 'cool', some_number_argument: 42}
       );
       const result = await contract.view(
         'some_view_function',
         {account_id: alice}
       );
       assert.equal(result, 'whatever');
     }),
     worker.fork(async ({alice, contract}) => {
       const result = await contract.view(
         'some_view_function',
         {account_id: alice}
       );
       /* Note that we expect the value returned from `some_view_function` to be
       a default here, because this `fork` runs *at the same time* as the
       previous, in a separate local blockchain */
       assert.equal(result, 'some default');
     });
   ]);
   ```

   Let's step through this.

   1. Like the earlier call to `Worker.init`, each call to `worker.fork` sets up its own Sandbox instance. Each will copy the data directory set up earlier as the starting point for its tests. Each will use a unique port so that tests can be safely run in parallel.
   2. `call` syntax mirrors [near-cli](https://github.com/near/near-cli) and either returns the successful return value of the given function or throws the encountered error. If you want to inspect a full transaction and/or avoid the `throw` behavior, you can use `call_raw` instead.
   3. While `call` is invoked on the account _doing the call_ (`alice.call(contract, …)`), `view` is invoked on the account _being viewed_ (`contract.view(…)`). This is because the caller of a view is irrelevant and ignored.
   4. Gotcha: the full account names does not match the strings passed to `createSubAccount` and `createAndDeploy`, which is why you must write `alice.call(contract, …)` rather than `alice.call('contract-account-name', …)`. But! The `Account` class overrides `toJSON` so that you can pass `{account_id: alice}` in arguments rather than `{account_id: alice.accountId}`. If you need the generated account ID in some other circumstance, remember to use `alice.accountId`.


See the [tests](https://github.com/near/workspaces-js/tree/main/__tests__) directory in this project for more examples.

Quick Start with AVA
===========
Since `near-workspaces` is designed for concurrency, AVA is a great fit, because it runs tests concurrently by default. To use`NEAR Workspaces` with AVA:
 1. Start with the basic setup described [here](https://github.com/avajs/ava).
 2. Add custom script for running tests on Testnet (if needed). Check instructions in `Running on Testnet` section.
 3. Add your tests following these example:

  ```ts
  import {Worker} from 'near-workspaces';
  import anyTest, {TestFn} from 'ava'

  const test = anyTest as TestFn<{worker: Worker}>;
  test.before(async t => {
    t.context.worker = await Worker.init(async ({root}) => ({
      contract: await root.createAndDeploy(
        'account-id-for-contract',
        'path/to/contract/file.wasm',
      ),
      /* Account that you will be able to use in your tests */
      ali: await root.createSubAccount('ali'),
    }));
  })

  test('Test name', async t => {
    /* Each test is making a "fork", a copy of the
    worker, that was created in "before" function.
    It allows you to isolate each test and run them concurrently */
    await t.context.worker.fork(async ({contract, ali}) => {
      await ali.call(contract, 'set_status', {message: 'hello'});
      const result: string = await contract.view('get_status', {
        account_id: ali,
      });
      t.is(result, 'hello');
    });
  });
  ```


"Spooning" Contracts from Testnet and Mainnet
=============================================

[Spooning a blockchain](https://coinmarketcap.com/alexandria/glossary/spoon-blockchain) is copying the data from one network into a different network. near-workspaces makes it easy to copy data from Mainnet or Testnet contracts into your local Sandbox environment:

```ts
await worker.fork(async ({root}) => {
  const refFinance = await root.importAccount({
    mainnetContract: 'v2.ref-finance.near',
    blockId: 50_000_000,
    withData: true,
  });
});
```

This would copy the Wasm bytes and contract state from [v2.ref-finance.near](https://explorer.near.org/accounts/v2.ref-finance.near) to your local blockchain as it existed at block `50_000_000`. This makes use of Sandbox's special [patch state](#patch-state-on-the-fly) feature to keep the contract name the same, even though the top level account might not exist locally (note that this means it only works in Sandbox testing mode). You can then interact with the contract in a deterministic way the same way you interact with all other accounts created with near-workspaces.

Gotcha: `withData` will only work out-of-the-box if the contract's data is 50kB or less. This is due to the default configuration of RPC servers; see [the "Heads Up" note here](https://docs.near.org/docs/api/rpc/contracts#view-contract-state). Some teams at NEAR are hard at work giving you an easy way to run your own RPC server, at which point you can point tests at your custom RPC endpoint and get around the 50kB limit.

See an [example of spooning](https://github.com/near/workspaces-js/blob/main/__tests__/05.spoon-contract-to-sandbox.ava.ts)  contracts.

Running on Testnet
==================

near-workspaces is set up so that you can write tests once and run them against a local Sandbox node (the default behavior) or against [NEAR TestNet](https://docs.near.org/docs/concepts/networks). Some reasons this might be helpful:

* Gives higher confidence that your contracts work as expected
* You can test against deployed testnet contracts
* If something seems off in Sandbox mode, you can compare it to testnet

You can run in testnet mode in three ways.

1. When creating your Worker, pass a config object as the first argument:

   ```ts
   const worker = await Worker.init(
     {network: 'testnet'},
     async ({root}) => { … }
   )
   ```

2. Set the `NEAR_WORKSPACES_NETWORK` environment variable when running your tests:

   ```bash
   NEAR_WORKSPACES_NETWORK=testnet node test.js
   ```

   If you set this environment variable and pass `{network: 'testnet'}` to `Worker.init`, the config object takes precedence.

3. If using `near-workspaces` with AVA, you can use a custom config file. Other test runners allow similar config files; adjust the following instructions for your situation.

   Create a file in the same directory as your `package.json` called `ava.testnet.config.cjs` with the following contents:

   ```js
   module.exports = {
     ...require('near-workspaces/ava.testnet.config.cjs'),
     ...require('./ava.config.cjs'),
   };
   ```

   The [near-workspaces/ava.testnet.config.cjs](https://github.com/near/workspaces-js/blob/main/ava.testnet.config.cjs) import sets the `NEAR_WORKSPACES_NETWORK` environment variable for you. A benefit of this approach is that you can then easily ignore files that should only run in Sandbox mode.

   Now you'll also want to add a `test:testnet` script to your `package.json`'s `scripts` section:

   ```diff
    "scripts": {
      "test": "ava",
   +  "test:testnet": "ava --config ./ava.testnet.config.cjs"
    }
    ```


Stepping through a testnet example
----------------------------------

Let's revisit a shortened version of the example from How It Works above, describing what will happen in Testnet.

1. Create a `Worker`.

   ```ts
   const worker = await Worker.init(async ({root}) => {
     await root.createSubAccount('alice');
     await root.createAndDeploy(
       'contract-account-name',
       'path/to/compiled.wasm'
     );
   });
   ```

   `Worker.init` does not interact with Testnet at all yet. Instead, the function runs at the beginning of each subsequent call to `worker.fork`. This matches the semantics of the sandbox that all subsequent calls to `fork` have the same starting point, however, testnet requires that each forkd worker has its own root account. In fact `Worker.init` creates a unique testnet account and each test is a unique sub-account.

2. Write tests.

   ```ts
   await Promise.all([
     worker.fork(async ({alice, contract}) => {
       await alice.call(
         contract,
         'some_update_function',
         {some_string_argument: 'cool', some_number_argument: 42}
       );
       const result = await contract.view(
         'some_view_function',
         {account_id: alice}
       );
       assert.equal(result, 'whatever');
     }),
     worker.fork(async ({alice, contract}) => {
       const result = await contract.view(
         'some_view_function',
         {account_id: alice}
       );
       assert.equal(result, 'some default');
     });
   ]);
   ```

   Each call to `worker.fork` will:

   - Get or create its own sub-account on testnet account, e.g. `t.rdsq0289478`. If creating the account the keys will be stored at `$PWD/.near-credentials/workspaces/testnet/t.rdsq0289478.json`.
   - Run the `initFn` passed to `Worker.init`
   - Create sub-accounts for each `createAccount` and `createAndDeploy`, such as `alice.t.rdsq0289478`
   - If the test account runs out of funds to create accounts it will request a transfer from the root account.
   - After the test is finished each account created is deleted and the funds sent back to the test account.

Note: Since the testnet accounts are cached, if account creation rate limits are reached simply wait a little while and try again.

Running tests only in Sandbox
-------------------------------

If some of your runs take advantage of Sandbox-specific features, you can skip these on testnet in two ways:

1. You can skip entire sections of your files by checking `getNetworkFromEnv() === 'sandbox'`.

   ```ts
   let worker = Worker.init(async ({root}) => ({ // note the implicit return
     contract: await root.createAndDeploy(
       'contract-account-name',
       'path/to/compiled.wasm'
     )
   }));
   worker.fork('thing that makes sense on any network', async ({…}) => {
     // logic using basic contract & account interactions
   });
   if (getNetworkFromEnv() === 'sandbox') {
     worker.fork('thing that only makes sense with sandbox', async ({…}) => {
       // logic using patch-state, fast-forwarding, etc
     });
   }
   ```

2. Use a separate testnet config file, as described under the "Running on Testnet" heading above.

Patch State on the Fly
======================

In Sandbox-mode, you can add or modify any contract state, contract code, account or access key with `patchState`.

You cannot perform arbitrary mutation on contract state with transactions since transactions can only include contract calls that mutate state in a contract-programmed way. For example, with an NFT contract, you can perform some operation with NFTs you have ownership of, but you cannot manipulate NFTs that are owned by other accounts since the smart contract is coded with checks to reject that. This is the expected behavior of the NFT contract. However, you may want to change another person's NFT for a test setup. This is called "arbitrary mutation on contract state" and can be done with `patchState`. Alternatively you can stop the node, dump state at genesis, edit genesis, and restart the node. The later approach is more complicated to do and also cannot be performed without restarting the node.

It is true that you can alter contract code, accounts, and access keys using normal transactions via the `DeployContract`, `CreateAccount`, and `AddKey` [actions](https://nomicon.io/RuntimeSpec/Actions.html?highlight=actions#actions). But this limits you to altering your own account or sub-account. `patchState` allows you to perform these operations on any account.

To see an example of how to do this, see the [patch-state test](https://github.com/near/workspaces-js/blob/main/__tests__/02.patch-state.ava.ts).

Pro Tips
========

* `NEAR_WORKSPACES_DEBUG=true` – run tests with this environment variable set to get copious debug output and a full log file for each Sandbox instance.

* `Worker.init` [config](https://github.com/near/workspaces-js/blob/main/packages/js/src/interfaces.ts) – you can pass a config object as the first argument to `Worker.init`. This lets you do things like:

  * skip initialization if specified data directory already exists

    ```ts
    Worker.init(
      { init: false, homeDir: './test-data/alice-owns-an-nft' },
      async ({root}) => { … }
    )
    ```

  * always recreate such data directory instead (the default behavior)

  * specify which port to run on

  * and more!
