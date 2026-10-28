package com.coreex.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class ApiExceptionHandler {

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ErrorBody> handle(ApiException e) {
		return ResponseEntity.status(e.status()).body(new ErrorBody(e.code(), e.getMessage()));
	}

	/** Thrown by @PreAuthorize, for example a non-admin calling an admin endpoint. */
	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ErrorBody> forbidden() {
		return ResponseEntity.status(HttpStatus.FORBIDDEN)
				.body(new ErrorBody("FORBIDDEN", "You are not allowed to do this."));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ErrorBody> invalid(MethodArgumentNotValidException e) {
		var field = e.getBindingResult().getFieldError();
		var message = field == null ? "The request is not valid." : field.getField() + ": " + field.getDefaultMessage();
		return ResponseEntity.badRequest().body(new ErrorBody("INVALID_REQUEST", message));
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<ErrorBody> unreadable() {
		return ResponseEntity.badRequest().body(new ErrorBody("INVALID_REQUEST", "The request body is not valid JSON."));
	}

}
