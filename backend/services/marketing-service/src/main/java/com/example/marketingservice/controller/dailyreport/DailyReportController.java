package com.example.marketingservice.controller.dailyreport;

import com.example.marketingservice.controller.base.BaseController;
import com.example.marketingservice.dto.dailyreport.DailyReportDto;
import com.example.marketingservice.dto.dailyreport.DailyReportDto.DailyReportItemDto;
import com.example.marketingservice.service.dailyreport.DailyReportService;

import org.springframework.data.domain.Page;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/marketing/daily-reports")
public class DailyReportController extends BaseController {

    @Autowired
    private DailyReportService dailyReportService;

    @GetMapping
    public ResponseEntity<List<DailyReportDto>> getAllReports(HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.view");
        List<DailyReportDto> reports = dailyReportService.getAllReports();
        return ResponseEntity.ok(reports);
    }

    @GetMapping("/paginated")
    public ResponseEntity<Page<DailyReportDto>> getPaginatedReports(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String createdBy,
            HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.view");
        Page<DailyReportDto> reports = dailyReportService.getPaginatedReports(page, size, startDate, endDate, createdBy);
        return ResponseEntity.ok(reports);
    }

    @GetMapping("/{reportId}")
    public ResponseEntity<DailyReportDto> getReportById(@PathVariable String reportId,
            HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.view");
        DailyReportDto report = dailyReportService.getReportById(reportId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/date/{reportDate}")
    public ResponseEntity<List<DailyReportDto>> getReportsByDate(@PathVariable String reportDate,
            HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.view");
        List<DailyReportDto> reports = dailyReportService.getReportsByDate(reportDate);
        return ResponseEntity.ok(reports);
    }

    @GetMapping("/user/{createdBy}")
    public ResponseEntity<List<DailyReportDto>> getReportsByCreatedBy(@PathVariable String createdBy,
            HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.view");
        List<DailyReportDto> reports = dailyReportService.getReportsByCreatedBy(createdBy);
        return ResponseEntity.ok(reports);
    }

    @PostMapping
    public ResponseEntity<DailyReportDto> createReport(@RequestBody CreateReportRequest request,
            HttpServletRequest httpRequest) {
        checkPermission(httpRequest, "menu.marketing.reports.create");

        Long userId = getCurrentUserId(httpRequest);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String createdBy = httpRequest.getHeader("X-Username");
        if (createdBy == null || createdBy.trim().isEmpty()) {
            createdBy = "user_" + userId;
        }

        try {
            DailyReportDto createdReport = dailyReportService.createReport(
                    createdBy,
                    userId.intValue(),
                    request.getReportDate(),
                    request.getItems());
            return ResponseEntity.status(HttpStatus.CREATED).body(createdReport);
        } catch (IllegalArgumentException e) {
            System.err.println("Invalid input for daily report creation: " + e.getMessage());
            return ResponseEntity.badRequest().body(null);
        } catch (RuntimeException e) {
            System.err.println("Error creating daily report: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PutMapping("/{reportId}")
    public ResponseEntity<DailyReportDto> updateReport(@PathVariable String reportId,
            @RequestBody CreateReportRequest request,
            HttpServletRequest httpRequest) {
        checkPermission(httpRequest, "menu.marketing.reports.edit");

        try {
            DailyReportDto updatedReport = dailyReportService.updateReport(
                    reportId,
                    request.getReportDate(),
                    request.getItems());
            return ResponseEntity.ok(updatedReport);
        } catch (IllegalArgumentException e) {
            System.err.println("Invalid input for daily report update: " + e.getMessage());
            return ResponseEntity.badRequest().body(null);
        } catch (RuntimeException e) {
            System.err.println("Error updating daily report: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @DeleteMapping("/{reportId}")
    public ResponseEntity<Void> deleteReport(@PathVariable String reportId,
            HttpServletRequest request) {
        checkPermission(request, "menu.marketing.reports.delete");

        try {
            dailyReportService.deleteReport(reportId);
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // Request DTO for create/update
    public static class CreateReportRequest {
        private String reportDate;
        private List<DailyReportItemDto> items;

        public String getReportDate() {
            return reportDate;
        }

        public void setReportDate(String reportDate) {
            this.reportDate = reportDate;
        }

        public List<DailyReportItemDto> getItems() {
            return items;
        }

        public void setItems(List<DailyReportItemDto> items) {
            this.items = items;
        }
    }
}
