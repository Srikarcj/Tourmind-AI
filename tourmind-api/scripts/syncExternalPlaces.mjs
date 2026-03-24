import { getStates, getStateBySlug } from "../src/services/dataService.js";
import { syncApiPlacesForState } from "../src/services/tourismSourceService.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const limitArg = args.find(arg => arg.startsWith("--max="));
const perQueryArg = args.find(arg => arg.startsWith("--per-query="));
const stateArg = args.find(arg => arg.startsWith("--state="));

const maxPlaces = limitArg ? Number(limitArg.split("=")[1]) : 280;
const perQueryLimit = perQueryArg ? Number(perQueryArg.split("=")[1]) : 25;
const stateSlug = stateArg ? String(stateArg.split("=")[1]).trim().toLowerCase() : "";

const run = async () => {
  if (stateSlug) {
    const state = await getStateBySlug(stateSlug);
    if (!state) {
      throw new Error(`State not found: ${stateSlug}`);
    }

    const synced = await syncApiPlacesForState(state, {
      force,
      maxPlaces,
      perQueryLimit
    });

    console.log(`Synced ${synced.length} API places for ${state.name} (${state.slug}).`);
    return;
  }

  const states = await getStates();
  let total = 0;

  for (const state of states) {
    const synced = await syncApiPlacesForState(state, {
      force,
      maxPlaces,
      perQueryLimit
    });

    total += synced.length;
    console.log(`Synced ${synced.length} API places for ${state.name}.`);
  }

  console.log(`Done. Imported ${total} API places across ${states.length} states/UTs.`);
};

run().catch(error => {
  console.error("Failed syncing external places", error);
  process.exit(1);
});
