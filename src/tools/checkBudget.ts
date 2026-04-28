import { getState, snapshot } from "../utils/budget.js";

export const checkBudgetSchema = {};

export async function checkBudget() {
  const state = await getState();
  const payload = snapshot(state);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
