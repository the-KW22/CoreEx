package com.coreex.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class ApiExceptionHandler {

	record ErrorBody(String code, String message) {
	}

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ErrorBody> handle(ApiException e) {
		return ResponseEntity.status(e.status()).body(new ErrorBody(e.code(), e.getMessage()));
	}

}
