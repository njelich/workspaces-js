import anyTest, {TestFn} from 'ava';
import {
  AccountManager,
  TestnetContainer,
  Worker,
  TestnetManager,
  getNetworkFromEnv,
} from '..';

const test = anyTest as TestFn<{worker: Worker}>;

if (getNetworkFromEnv() === 'testnet') {
  test('should create a new account', async t => {
    const accountManager = AccountManager.create(TestnetContainer.defaultConfig);
    await accountManager.init();
    const {root} = accountManager;
    t.true(await root.exists());
  });

  test('should be able to add funds', async t => {
    const accountManager = AccountManager.create(TestnetContainer.defaultConfig) as TestnetManager;
    await accountManager.init();
    const {root} = accountManager;
    const balance = await root.availableBalance();
    await accountManager.addFundsFromNetwork();
    const newBalance = await root.availableBalance();
    t.true(balance.lt(newBalance));
  });
} else {
  test('skipping on ' + getNetworkFromEnv(), t => {
    t.true(true);
  });
}
