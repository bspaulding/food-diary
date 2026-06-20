import Foundation
import Security

/// Minimal wrapper over `Security` for storing the refresh token only.
/// Accessibility is `kSecAttrAccessibleAfterFirstUnlock` (PRD §6.5 item 5) —
/// available in the background after the device has been unlocked once.
struct Keychain {
    private let service: String

    init(service: String = "com.bspaulding.fooddiary.refreshToken") {
        self.service = service
    }

    func set(_ value: String) {
        let data = Data(value.utf8)
        var query = baseQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    func get() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete() {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
    }
}
