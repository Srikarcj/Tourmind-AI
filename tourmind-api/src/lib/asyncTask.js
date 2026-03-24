export const fireAndForget = asyncTask => {
  Promise.resolve(asyncTask).catch((error) => {
    console.error("Background task failed", error);
  });
};
