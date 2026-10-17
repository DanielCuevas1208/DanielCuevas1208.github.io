export const CONDITION_POLICY_VERSION=1;
export function hasCurrentConditionPolicy(skill,row){
  return !/\bpopularity(?:[<>=!])/.test(JSON.stringify(skill))
    || Number(row?.conditionPolicyVersion)>=CONDITION_POLICY_VERSION;
}
