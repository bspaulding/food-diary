import Foundation

/// Home for GraphQL query/mutation strings, mirroring `web/src/Api.ts` 1:1.
/// Phase 0 establishes the pattern only; Phase 1 fills in the v1 operations
/// (diary, items, recipes, search, suggestions, targets).
enum Api {
    static let getWeeklyStats = """
        query GetWeeklyStats($from: timestamptz!, $to: timestamptz!) {
          diary_entry_aggregate(where: { consumed_at: { _gte: $from, _lte: $to } }) {
            aggregate {
              sum {
                calories
              }
            }
          }
        }
        """
}
