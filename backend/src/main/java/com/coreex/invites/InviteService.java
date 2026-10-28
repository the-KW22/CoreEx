package com.coreex.invites;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.identity.IdentityService;

@Service
class InviteService {

	private final InviteRepository invites;

	private final IdentityService identity;

	InviteService(InviteRepository invites, IdentityService identity) {
		this.invites = invites;
		this.identity = identity;
	}

	Invite create(String email) {
		var normalized = email.trim().toLowerCase();
		if (identity.hasUser(normalized)) {
			throw new ApiException(HttpStatus.CONFLICT, "USER_EXISTS", "Someone with this email already has an account.");
		}
		try {
			return invites.insert(normalized);
		}
		catch (DuplicateKeyException e) {
			throw new ApiException(HttpStatus.CONFLICT, "INVITE_EXISTS", "This email already has a pending Invite.");
		}
	}

	List<Invite> list(int page, int size) {
		return invites.findPage(size, page * size);
	}

	long total() {
		return invites.count();
	}

	Invite revoke(UUID id) {
		if (!invites.revokePending(id)) {
			if (invites.findById(id).isEmpty()) {
				throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Invite.");
			}
			throw new ApiException(HttpStatus.CONFLICT, "INVITE_NOT_PENDING", "Only a pending Invite can be revoked.");
		}
		return invites.findById(id).orElseThrow();
	}

}
