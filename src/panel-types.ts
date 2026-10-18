export type Mutate = (
  label: string,
  action: (root: string) => Promise<unknown>,
  success: string,
) => Promise<boolean>;
