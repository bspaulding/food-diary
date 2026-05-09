import { adminClient } from './client';

// Deletes all test data for a user. Must run in FK dependency order:
// diary_entry → recipe_item → recipe → nutrition_item
export async function cleanupUser(...userIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const userId of userIds) {
    await admin.request(
      `mutation Cleanup($uid: String!) {
        delete_food_diary_diary_entry(where: { user_id: { _eq: $uid } }) { affected_rows }
      }`,
      { uid: userId },
    );
    await admin.request(
      `mutation Cleanup($uid: String!) {
        delete_food_diary_recipe_item(where: { user_id: { _eq: $uid } }) { affected_rows }
      }`,
      { uid: userId },
    );
    await admin.request(
      `mutation Cleanup($uid: String!) {
        delete_food_diary_recipe(where: { user_id: { _eq: $uid } }) { affected_rows }
      }`,
      { uid: userId },
    );
    await admin.request(
      `mutation Cleanup($uid: String!) {
        delete_food_diary_nutrition_item(where: { user_id: { _eq: $uid } }) { affected_rows }
      }`,
      { uid: userId },
    );
  }
}
