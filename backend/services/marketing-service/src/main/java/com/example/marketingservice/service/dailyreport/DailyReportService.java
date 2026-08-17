package com.example.marketingservice.service.dailyreport;

import com.example.marketingservice.dto.dailyreport.DailyReportDto;
import com.example.marketingservice.dto.dailyreport.DailyReportDto.DailyReportItemDto;
import com.example.marketingservice.entity.dailyreport.DailyReport;
import com.example.marketingservice.entity.dailyreport.DailyReportItem;
import com.example.marketingservice.repository.dailyreport.DailyReportRepository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class DailyReportService {

    @Autowired
    private DailyReportRepository dailyReportRepository;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${user.service.url:http://gateway:8080}")
    private String userServiceUrl;

    private Map<String, String> userFullNameCache = new java.util.concurrent.ConcurrentHashMap<>();
    private Map<String, String> userPhoneCache = new java.util.concurrent.ConcurrentHashMap<>();

    public Page<DailyReportDto> getPaginatedReports(int page, int size, String startDate, String endDate, String createdBy) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "reportDate", "createdAt"));
        Page<DailyReport> reportPage = dailyReportRepository.findByFilters(startDate, endDate, createdBy, pageable);
        
        return reportPage.map(report -> {
            Integer userId = null;
            try {
                String url = userServiceUrl + "/api/users/username/" + report.getCreatedBy() + "/id";
                userId = restTemplate.getForObject(url, Integer.class);
            } catch (Exception e) {
                System.err.println("Error fetching user ID for " + report.getCreatedBy() + ": " + e.getMessage());
            }
            return convertToDto(report, userId);
        });
    }

    public List<DailyReportDto> getAllReports() {
        List<DailyReport> reports = dailyReportRepository.findAllByOrderByCreatedAtDesc();
        return reports.stream()
                .map(report -> {
                    // Try to get user ID from username for existing reports
                    Integer userId = null;
                    try {
                        String url = userServiceUrl + "/api/users/username/" + report.getCreatedBy() + "/id";
                        userId = restTemplate.getForObject(url, Integer.class);
                    } catch (Exception e) {
                        // Log error but continue with null userId
                        System.err
                                .println("Error fetching user ID for " + report.getCreatedBy() + ": " + e.getMessage());
                    }
                    return convertToDto(report, userId);
                })
                .collect(Collectors.toList());
    }

    public DailyReportDto getReportById(String reportId) {
        DailyReport report = dailyReportRepository.findByReportId(reportId)
                .orElseThrow(() -> new RuntimeException("Report not found: " + reportId));

        // Try to get user ID from username for existing reports
        Integer userId = null;
        try {
            String url = userServiceUrl + "/api/users/username/" + report.getCreatedBy() + "/id";
            userId = restTemplate.getForObject(url, Integer.class);
        } catch (Exception e) {
            // Log error but continue with null userId
            System.err.println("Error fetching user ID for " + report.getCreatedBy() + ": " + e.getMessage());
        }

        return convertToDto(report, userId);
    }

    public List<DailyReportDto> getReportsByDate(String reportDate) {
        List<DailyReport> reports = dailyReportRepository.findByReportDateOrderByReportDateDesc(reportDate);
        return reports.stream()
                .map(report -> {
                    // Try to get user ID from username for existing reports
                    Integer userId = null;
                    try {
                        String url = userServiceUrl + "/api/users/username/" + report.getCreatedBy() + "/id";
                        userId = restTemplate.getForObject(url, Integer.class);
                    } catch (Exception e) {
                        // Log error but continue with null userId
                        System.err
                                .println("Error fetching user ID for " + report.getCreatedBy() + ": " + e.getMessage());
                    }
                    return convertToDto(report, userId);
                })
                .collect(Collectors.toList());
    }

    public List<DailyReportDto> getReportsByCreatedBy(String createdBy) {
        List<DailyReport> reports = dailyReportRepository.findByCreatedByOrderByCreatedAtDesc(createdBy);
        return reports.stream()
                .map(report -> {
                    // Try to get user ID from username for existing reports
                    Integer userId = null;
                    try {
                        String url = userServiceUrl + "/api/users/username/" + report.getCreatedBy() + "/id";
                        userId = restTemplate.getForObject(url, Integer.class);
                    } catch (Exception e) {
                        // Log error but continue with null userId
                        System.err
                                .println("Error fetching user ID for " + report.getCreatedBy() + ": " + e.getMessage());
                    }
                    return convertToDto(report, userId);
                })
                .collect(Collectors.toList());
    }

    public DailyReportDto createReport(String createdBy, Integer userId, String reportDate,
            List<DailyReportItemDto> itemDtos) {
        // Generate unique report ID
        String reportId = generateReportId();

        // Convert DTOs to entities
        List<DailyReportItem> items = itemDtos.stream()
                .filter(itemDto -> itemDto.getName() != null && !itemDto.getName().trim().isEmpty()
                        && itemDto.getValues() != null && !itemDto.getValues().isEmpty()
                        && itemDto.getValues().stream().anyMatch(v -> v != null && !v.trim().isEmpty()))
                .map(itemDto -> {
                    List<String> validValues = itemDto.getValues().stream()
                            .filter(value -> value != null && !value.trim().isEmpty())
                            .collect(Collectors.toList());
                    return new DailyReportItem(itemDto.getName(), validValues);
                })
                .collect(Collectors.toList());

        if (items.isEmpty()) {
            throw new IllegalArgumentException("At least one valid item with values is required");
        }

        DailyReport report = new DailyReport(reportId, createdBy, reportDate, items);
        DailyReport savedReport = dailyReportRepository.save(report);

        return convertToDto(savedReport, userId);
    }

    public DailyReportDto updateReport(String reportId, String reportDate, List<DailyReportItemDto> itemDtos) {
        DailyReport existingReport = dailyReportRepository.findByReportId(reportId)
                .orElseThrow(() -> new RuntimeException("Report not found: " + reportId));

        // Update report date
        existingReport.setReportDate(reportDate);

        // Convert and update items
        List<DailyReportItem> items = itemDtos.stream()
                .filter(itemDto -> itemDto.getName() != null && !itemDto.getName().trim().isEmpty()
                        && itemDto.getValues() != null && !itemDto.getValues().isEmpty()
                        && itemDto.getValues().stream().anyMatch(v -> v != null && !v.trim().isEmpty()))
                .map(itemDto -> {
                    List<String> validValues = itemDto.getValues().stream()
                            .filter(value -> value != null && !value.trim().isEmpty())
                            .collect(Collectors.toList());
                    return new DailyReportItem(itemDto.getName(), validValues);
                })
                .collect(Collectors.toList());

        if (items.isEmpty()) {
            throw new IllegalArgumentException("At least one valid item with values is required");
        }

        // Properly update the items collection to avoid orphan deletion issues
        existingReport.getItems().clear();
        for (DailyReportItem item : items) {
            item.setDailyReport(existingReport);
            existingReport.getItems().add(item);
        }

        DailyReport updatedReport = dailyReportRepository.save(existingReport);

        return convertToDto(updatedReport);
    }

    public void deleteReport(String reportId) {
        DailyReport report = dailyReportRepository.findByReportId(reportId)
                .orElseThrow(() -> new RuntimeException("Report not found: " + reportId));
        dailyReportRepository.delete(report);
    }

    private String generateReportId() {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        return "report_" + timestamp + "_" + UUID.randomUUID().toString().substring(0, 8);
    }

    private String getUsernameById(Integer userId) {
        if (userId == null)
            return null;

        try {
            String url = userServiceUrl + "/api/users/" + userId + "/username";
            return restTemplate.getForObject(url, String.class);
        } catch (Exception e) {
            System.err.println("Error fetching username for userId " + userId + ": " + e.getMessage());
            return null;
        }
    }

    private String getUserFullName(String username) {
        if (username == null)
            return null;

        // Check cache first
        return userFullNameCache.computeIfAbsent(username, user -> {
            try {
                String url = userServiceUrl + "/api/users/username/" + user + "/fullname";
                @SuppressWarnings("unchecked")
                Map<String, Object> response = restTemplate.getForObject(url, Map.class);
                if (response != null && response.containsKey("fullName")) {
                    // Also cache the phone number if available
                    if (response.containsKey("phone")) {
                        userPhoneCache.put(user, (String) response.get("phone"));
                    }
                    return (String) response.get("fullName");
                }
            } catch (Exception e) {
                // Log error but don't fail the report generation
                System.err.println("Error fetching user full name for " + user + ": " + e.getMessage());
            }
            return username; // Fallback to username if full name not found
        });
    }

    private String getUserPhone(String username) {
        if (username == null)
            return null;

        // Check cache first
        return userPhoneCache.computeIfAbsent(username, user -> {
            try {
                String url = userServiceUrl + "/api/users/username/" + user + "/fullname";
                @SuppressWarnings("unchecked")
                Map<String, Object> response = restTemplate.getForObject(url, Map.class);
                if (response != null && response.containsKey("phone")) {
                    // Also cache the full name if available
                    if (response.containsKey("fullName")) {
                        userFullNameCache.put(user, (String) response.get("fullName"));
                    }
                    return (String) response.get("phone");
                }
            } catch (Exception e) {
                // Log error but don't fail the report generation
                System.err.println("Error fetching user phone for " + user + ": " + e.getMessage());
            }
            return null; // Return null if phone not found
        });
    }

    private DailyReportDto convertToDto(DailyReport report) {
        return convertToDto(report, null);
    }

    private DailyReportDto convertToDto(DailyReport report, Integer userId) {
        List<DailyReportItemDto> itemDtos = report.getItems().stream()
                .map(item -> new DailyReportItemDto(item.getItemName(), item.getValues()))
                .collect(Collectors.toList());

        String createdByFullName = null;
        String createdByPhone = null;
        if (userId != null) {
            // Try to get user full name and phone by first getting the username from userId
            try {
                String username = getUsernameById(userId);
                if (username != null) {
                    createdByFullName = getUserFullName(username);
                    createdByPhone = getUserPhone(username);
                }
            } catch (Exception e) {
                // Log error but don't fail the report generation
                System.err.println("Error fetching user full name for userId " + userId + ": " + e.getMessage());
            }
        }

        if (createdByFullName == null) {
            createdByFullName = getUserFullName(report.getCreatedBy());
        }
        if (createdByPhone == null) {
            createdByPhone = getUserPhone(report.getCreatedBy());
        }

        return new DailyReportDto(
                report.getReportId(),
                report.getCreatedBy(),
                createdByFullName,
                createdByPhone,
                report.getReportDate(),
                report.getCreatedAt(),
                report.getUpdatedAt(),
                itemDtos);
    }
}
