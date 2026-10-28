package com.coreex.common;

import org.springframework.http.HttpStatus;

/** A business-rule failure that becomes {@code { "code": ..., "message": ... }} with the given status. */
public class ApiException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}

}
