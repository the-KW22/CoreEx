package com.coreex;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.coreex.export.ResumePdfRenderer;
import com.coreex.export.ResumePdfRequest;

/** Replaces the Next.js PDF route, so no test needs the frontend running. Records what it was asked to draw. */
public class TestResumePdfRenderer implements ResumePdfRenderer {

	public static final byte[] PDF = "%PDF-1.7 stub".getBytes(StandardCharsets.UTF_8);

	private final List<ResumePdfRequest> requests = new CopyOnWriteArrayList<>();

	private volatile boolean failing;

	@Override
	public byte[] render(ResumePdfRequest request) throws IOException {
		requests.add(request);
		if (failing) {
			throw new IOException("The stub renderer is down.");
		}
		return PDF;
	}

	public List<ResumePdfRequest> requests() {
		return List.copyOf(requests);
	}

	public void setFailing(boolean failing) {
		this.failing = failing;
	}

	public void clear() {
		requests.clear();
		failing = false;
	}

}
