package com.coreex.common;

import io.swagger.v3.oas.annotations.media.Schema;

/** The one error format of the API: a stable code for programs and a message for people. */
public record ErrorBody(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String code,
		@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message) {
}
