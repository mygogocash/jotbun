// Prints derivedLook for each id given (the wallet looks' own rule), to pick fixed ids for the tests.
import { derivedLook } from '../work/apps/app/src/wallet/looks/walletLooks.ts';
for (const id of process.argv.slice(2)) console.log(id, JSON.stringify(derivedLook(id)));
