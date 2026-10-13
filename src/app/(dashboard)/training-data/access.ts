import type { ConsoleAccessKind } from "@/domain";

/**
 * Who may create training snapshots and download them: the action and the route. The
 * page names the same list literally, as every narrow page does.
 */
export const TRAINING_ACCESS: readonly ConsoleAccessKind[] = ["super_admin"];
