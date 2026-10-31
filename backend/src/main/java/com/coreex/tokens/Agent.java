package com.coreex.tokens;

import com.coreex.identity.User;

/** Who is calling /mcp: the User an Access token acts for, and the token's name (shown as "Edited by"). */
public record Agent(User user, String tokenName) {

	/** Where the token filter leaves the Agent on the request, for the MCP transport to pick up. */
	public static final String ATTRIBUTE = "currentAgent";

}
