package com.coreex.export;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How soon a User may export again, and where the frontend draws Resume PDFs with the secret that proves the call is
 * ours. Configuration, not code. Empty PDF settings: the PDF of each Resume is listed as omitted.
 */
@ConfigurationProperties("coreex.export")
record ExportProperties(@DefaultValue("1m") Duration minInterval, @DefaultValue("") String pdfUrl,
		@DefaultValue("") String pdfSecret) {
}
