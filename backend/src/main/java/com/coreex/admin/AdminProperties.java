package com.coreex.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code hostingLimitBytes}: the storage the hosting plan allows in total (1 GiB on the Supabase free tier). */
@ConfigurationProperties("coreex.admin")
record AdminProperties(@DefaultValue("1073741824") long hostingLimitBytes) {
}
