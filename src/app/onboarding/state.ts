export type OnboardingActionState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Record<string, string>;
};

export const initialOnboardingState: OnboardingActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};
