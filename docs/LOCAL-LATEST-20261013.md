# Verified local source and preparation evidence

Core ZIP SHA256: `80a30462e30c8f7e0586d5542199814673e8665526e32731c0405987b1473df2`.
Add-on ZIP SHA256: `9433158e21af42ed13b495c4e70b061ed74dfa14db6e98f9816c8149000276dd`.

Core contains every non-artifact file in its source manifest. Parts 2 and 4 are still missing historical screenshots/verification artifacts; part 3 is available. This branch preserves existing upstream files and workflows and adds the practical/family/workbook candidate source.

The preparation details now use the reviewed evidence-plan contract. Revisions are opaque tab-local IDs bound to current conditions and action content. Changes invalidate adoption; STOP suppresses the ordinary priority cards and disables adoption. Training source times and expiry remain explicitly unknown. Confirmation is preparation only, never route safety approval or walking restart. The independent save/restore contract is included, but no persistent preparation-card UI has been connected yet.

Mac validation: build and 546 app tests passed; 17 additional evidence-plan contract tests passed. Local training server starts at http://127.0.0.1:5174. Browser UI automation was unavailable on this host; interactive screen acceptance remains unverified.

Start with `npm ci --ignore-scripts`, then `VITE_LIVINGTOWN_DATA_MODE=local npm run dev -- --host 127.0.0.1 --port 5174`. Run `npm run build`, `npm test`, and `node --test src/workbook/evidence-plan.contract.mjs`. No deployment or real household data was used.
