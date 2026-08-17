package com.example.marketingservice.service.schedule;

import com.example.marketingservice.dto.schedule.WeeklyScheduleDayRequest;
import com.example.marketingservice.dto.schedule.WeeklyScheduleDayResponse;
import com.example.marketingservice.dto.schedule.WeeklyScheduleRequest;
import com.example.marketingservice.dto.schedule.WeeklyScheduleResponse;
import com.example.marketingservice.entity.schedule.WeeklySchedule;
import com.example.marketingservice.entity.schedule.WeeklyScheduleDay;
import com.example.marketingservice.exception.ScheduleAlreadyExistsException;
import com.example.marketingservice.repository.schedule.WeeklyScheduleDayRepository;
import com.example.marketingservice.repository.schedule.WeeklyScheduleRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class WeeklyScheduleService {

    @Autowired
    private WeeklyScheduleRepository weeklyScheduleRepository;

    @Autowired
    private WeeklyScheduleDayRepository weeklyScheduleDayRepository;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${user.service.url:http://gateway:8080}")
    private String userServiceUrl;

    private Map<String, String> userFullNameCache = new java.util.concurrent.ConcurrentHashMap<>();
    private Map<String, String> userPhoneCache = new java.util.concurrent.ConcurrentHashMap<>();

    public List<WeeklyScheduleResponse> generateBusinessMonth(Integer year, Integer month) {
        List<WeeklyScheduleResponse> weeks = new ArrayList<>();

        LocalDate firstOfMonth = LocalDate.of(year, month, 1);
        LocalDate lastOfMonth = firstOfMonth.withDayOfMonth(firstOfMonth.lengthOfMonth());

        // Find Monday on or before first day
        LocalDate start = firstOfMonth;
        while (start.getDayOfWeek().getValue() != 1) { // 1 = Monday
            start = start.minusDays(1);
        }

        LocalDate current = start;
        int weekNumber = 0;
        boolean startedMonth = false;

        while (!current.isAfter(lastOfMonth) || current.getDayOfWeek().getValue() != 1) {
            List<WeeklyScheduleDayResponse> days = new ArrayList<>();

            for (int i = 0; i < 7; i++) {
                WeeklyScheduleDayResponse day = new WeeklyScheduleDayResponse();
                day.setDate(current);
                day.setDayName(current.getDayOfWeek().toString());
                day.setDayNumber(current.getDayOfMonth());
                day.setInMonth(current.getMonthValue() == month);
                day.setIsDayOff(false);
                day.setMorningSchedule("");
                day.setAfternoonSchedule("");
                day.setRemark("");
                days.add(day);
                current = current.plusDays(1);
            }

            boolean hasMonthDay = days.stream().anyMatch(d -> d.getInMonth());

            // Detect first Monday inside month
            if (!startedMonth) {
                boolean mondayInMonth = days.stream().anyMatch(d -> d.getDayName().equals("MONDAY") && d.getInMonth());
                if (mondayInMonth) {
                    startedMonth = true;
                    weekNumber = 1;
                }
            } else {
                weekNumber++;
            }

            if (hasMonthDay && startedMonth) {
                WeeklyScheduleResponse weekResponse = new WeeklyScheduleResponse();
                weekResponse.setWeekNumber(weekNumber);
                weekResponse.setYear(year);
                weekResponse.setMonth(month);
                weekResponse.setDays(days);
                weeks.add(weekResponse);
            }
        }

        return weeks;
    }

    public WeeklyScheduleResponse createSchedule(WeeklyScheduleRequest request, Long createdBy) {
        // Check if schedule already exists
        if (weeklyScheduleRepository.existsByUserIdAndYearAndMonthAndWeekNumber(
                request.getUserId(), request.getYear(), request.getMonth(), request.getWeekNumber())) {
            throw new ScheduleAlreadyExistsException("Schedule already exists for this user, week, and month");
        }

        WeeklySchedule schedule = new WeeklySchedule();
        schedule.setUserId(request.getUserId());
        schedule.setYear(request.getYear());
        schedule.setMonth(request.getMonth());
        schedule.setWeekNumber(request.getWeekNumber());
        schedule.setCreatedBy(createdBy);

        // Set branch if provided
        if (request.getBranchId() != null) {
            // TODO: Implement branch lookup when branch service is available
            // For now, we'll skip branch assignment
        }

        // Save schedule first
        schedule = weeklyScheduleRepository.save(schedule);

        // Create and save days
        List<WeeklyScheduleDay> days = new ArrayList<>();
        if (request.getDays() != null) {
            for (WeeklyScheduleDayRequest dayRequest : request.getDays()) {
                WeeklyScheduleDay day = convertToDayEntity(dayRequest, schedule);
                days.add(day);
            }
        }
        weeklyScheduleDayRepository.saveAll(days);

        return convertToResponse(schedule);
    }

    public WeeklyScheduleResponse updateSchedule(Long id, WeeklyScheduleRequest request) {
        WeeklySchedule schedule = weeklyScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Schedule not found"));

        // Update branch if provided
        if (request.getBranchId() != null) {
            // TODO: Implement branch lookup when branch service is available
            // For now, we'll skip branch assignment
        }

        // Update days
        if (request.getDays() != null) {
            // Update existing days instead of recreating them
            List<WeeklyScheduleDay> existingDays = weeklyScheduleDayRepository.findByWeeklyScheduleId(id);
            for (int i = 0; i < request.getDays().size() && i < existingDays.size(); i++) {
                WeeklyScheduleDayRequest dayRequest = request.getDays().get(i);
                WeeklyScheduleDay existingDay = existingDays.get(i);
                if (existingDay != null) {
                    existingDay.setDayNumber(dayRequest.getDayNumber());
                    existingDay.setDayName(dayRequest.getDayName());
                    existingDay.setDate(dayRequest.getDate());
                    existingDay.setIsDayOff(dayRequest.getIsDayOff());
                    existingDay.setRemark(dayRequest.getRemark());
                    existingDay.setMorningSchedule(dayRequest.getMorningSchedule());
                    existingDay.setAfternoonSchedule(dayRequest.getAfternoonSchedule());
                    existingDay.setInMonth(dayRequest.getInMonth());
                }
            }
            weeklyScheduleDayRepository.saveAll(existingDays);
        }

        schedule = weeklyScheduleRepository.save(schedule);
        return convertToResponse(schedule);
    }

    @Transactional(readOnly = true)
    public List<WeeklyScheduleResponse> getUserSchedules(Long userId, Integer year, Integer month) {
        List<WeeklySchedule> schedules = weeklyScheduleRepository.findByUserIdAndYearAndMonthOrderByWeekNumber(userId,
                year, month);
        return schedules.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<WeeklyScheduleResponse> getAllSchedules(Integer year, Integer month, Long userId) {
        List<WeeklySchedule> schedules = weeklyScheduleRepository.findByFilters(year, month, userId);
        return schedules.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Page<WeeklyScheduleResponse> getPaginatedSchedules(int page, int size, Integer year, Integer month, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        Page<WeeklySchedule> schedulePage = weeklyScheduleRepository.findPaginatedByFilters(year, month, userId, pageable);
        return schedulePage.map(this::convertToResponse);
    }

    @Transactional(readOnly = true)
    public WeeklyScheduleResponse getSchedule(Long id) {
        WeeklySchedule schedule = weeklyScheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Schedule not found"));
        return convertToResponse(schedule);
    }

    public void deleteSchedule(Long id) {
        if (!weeklyScheduleRepository.existsById(id)) {
            throw new RuntimeException("Schedule not found");
        }
        weeklyScheduleRepository.deleteById(id);
    }

    private WeeklyScheduleResponse convertToResponse(WeeklySchedule schedule) {
        WeeklyScheduleResponse response = new WeeklyScheduleResponse();
        response.setId(schedule.getId());
        response.setUserId(schedule.getUserId());
        response.setCreatedBy(schedule.getCreatedBy() != null ? schedule.getCreatedBy().toString() : null);
        response.setYear(schedule.getYear());
        response.setMonth(schedule.getMonth());
        response.setWeekNumber(schedule.getWeekNumber());
        response.setCreatedAt(schedule.getCreatedAt());
        response.setUpdatedAt(schedule.getUpdatedAt());

        // Fetch user full name and phone number
        String createdByFullName = null;
        String createdByPhone = null;
        Long createdByUserId = schedule.getCreatedBy();

        if (createdByUserId != null) {
            try {
                String username = getUsernameById(createdByUserId);
                if (username != null) {
                    createdByFullName = getUserFullName(username);
                    createdByPhone = getUserPhone(username);
                }
            } catch (Exception e) {
                System.err.println("Error fetching user info for userId " + createdByUserId + ": " + e.getMessage());
            }
        }

        response.setCreatedByFullName(createdByFullName);
        response.setCreatedByPhone(createdByPhone);
        response.setCreatedByUserId(createdByUserId);

        // Convert branch
        if (schedule.getBranch() != null) {
            WeeklyScheduleResponse.BranchInfo branchInfo = new WeeklyScheduleResponse.BranchInfo();
            branchInfo.setId(schedule.getBranch().getId());
            branchInfo.setName(schedule.getBranch().getName());
            response.setBranch(branchInfo);
        }

        // Convert days
        List<WeeklyScheduleDayResponse> dayResponses = schedule.getDays().stream()
                .map(this::convertDayToResponse)
                .collect(Collectors.toList());
        response.setDays(dayResponses);

        return response;
    }

    private WeeklyScheduleDayResponse convertDayToResponse(WeeklyScheduleDay day) {
        WeeklyScheduleDayResponse response = new WeeklyScheduleDayResponse();
        response.setId(day.getId());
        response.setDayNumber(day.getDayNumber());
        response.setDayName(day.getDayName());
        response.setDate(day.getDate());
        response.setIsDayOff(day.getIsDayOff());
        response.setRemark(day.getRemark());
        response.setMorningSchedule(day.getMorningSchedule());
        response.setAfternoonSchedule(day.getAfternoonSchedule());
        response.setInMonth(day.getInMonth());
        return response;
    }

    private WeeklyScheduleDay convertToDayEntity(WeeklyScheduleDayRequest request, WeeklySchedule schedule) {
        WeeklyScheduleDay day = new WeeklyScheduleDay();
        day.setWeeklySchedule(schedule);
        day.setDayNumber(request.getDayNumber());
        day.setDayName(request.getDayName());
        day.setDate(request.getDate());
        day.setIsDayOff(request.getIsDayOff());
        day.setRemark(request.getRemark());
        day.setMorningSchedule(request.getMorningSchedule());
        day.setAfternoonSchedule(request.getAfternoonSchedule());
        day.setInMonth(request.getInMonth());
        return day;
    }

    private String getUsernameById(Long userId) {
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
}
