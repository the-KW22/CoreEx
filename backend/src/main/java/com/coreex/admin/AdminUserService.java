package com.coreex.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.assets.AssetProperties;
import com.coreex.assets.UserFiles;
import com.coreex.common.ApiException;
import com.coreex.identity.AuthAccounts;
import com.coreex.identity.User;

/**
 * Account administration: Users with their usage, quotas, disabling, and the overview. A disabled User is refused on
 * their very next request, because the identity check reads the status from the database every time.
 */
@Service
class AdminUserService {

	record UserSummary(UUID id, String email, User.Role role, User.Status status, Instant createdAt,
			Instant lastActiveAt, long itemCount, long storageUsedBytes, long storageQuotaBytes, boolean customQuota) {
	}

	record Overview(long totalUsers, long disabledUsers, long storageUsedBytes, long hostingLimitBytes) {
	}

	private final AdminUserRepository users;

	private final AssetProperties assets;

	private final AdminProperties properties;

	private final UserFiles files;

	private final AuthAccounts authAccounts;

	AdminUserService(AdminUserRepository users, AssetProperties assets, AdminProperties properties, UserFiles files,
			AuthAccounts authAccounts) {
		this.users = users;
		this.assets = assets;
		this.properties = properties;
		this.files = files;
		this.authAccounts = authAccounts;
	}

	List<UserSummary> list(int page, int size) {
		return users.page(size, (long) page * size).stream().map(this::summary).toList();
	}

	long total() {
		return users.count();
	}

	/** Null puts the User back on the configured default quota. */
	@Transactional
	UserSummary setQuota(UUID id, Long bytes) {
		if (!users.setQuota(id, bytes)) {
			throw notFound();
		}
		return get(id);
	}

	@Transactional
	UserSummary disable(UUID actingAdminId, UUID id) {
		if (id.equals(actingAdminId)) {
			throw new ApiException(HttpStatus.CONFLICT, "CANNOT_DISABLE_SELF",
					"You cannot disable your own account.");
		}
		return setStatus(id, User.Status.DISABLED);
	}

	@Transactional
	UserSummary enable(UUID id) {
		return setStatus(id, User.Status.ACTIVE);
	}

	/**
	 * Removes a User for good so their email can be invited again: their files, their sign-in, then their rows. They
	 * are disabled first, and every step is safe to repeat, so a failure halfway leaves a disabled User and a retry
	 * finishes the job. Admins stay: disable them instead.
	 */
	void remove(UUID id) {
		var user = users.find(id).orElseThrow(AdminUserService::notFound);
		if (user.role() == User.Role.ADMIN) {
			throw new ApiException(HttpStatus.CONFLICT, "CANNOT_REMOVE_ADMIN", "An Admin cannot be removed.");
		}
		users.setStatus(id, User.Status.DISABLED);
		files.deleteAllOf(id);
		authAccounts.delete(id);
		users.delete(id);
	}

	Overview overview() {
		var totals = users.totals();
		return new Overview(totals.users(), totals.disabledUsers(), totals.usedBytes(), properties.hostingLimitBytes());
	}

	private UserSummary setStatus(UUID id, User.Status status) {
		if (!users.setStatus(id, status)) {
			throw notFound();
		}
		return get(id);
	}

	private UserSummary get(UUID id) {
		return summary(users.find(id).orElseThrow(AdminUserService::notFound));
	}

	private UserSummary summary(AdminUserRepository.Row row) {
		var custom = row.quotaOverride() != null;
		return new UserSummary(row.id(), row.email(), row.role(), row.status(), row.createdAt(), row.lastActiveAt(),
				row.itemCount(), row.usedBytes(), custom ? row.quotaOverride() : assets.defaultQuotaBytes(), custom);
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such User.");
	}

}
