package com.remindue;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RemindueApplication {
    public static void main(String[] args) {
        SpringApplication.run(RemindueApplication.class, args);
    }
}
