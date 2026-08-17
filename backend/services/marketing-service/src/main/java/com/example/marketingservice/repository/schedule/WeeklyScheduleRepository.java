package com.example.marketingservice.repository.schedule;

import com.example.marketingservice.entity.schedule.WeeklySchedule;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WeeklyScheduleRepository extends JpaRepository<WeeklySchedule, Long> {

    List<WeeklySchedule> findByUserIdAndYearAndMonthOrderByWeekNumber(Long userId, Integer year, Integer month);

    Optional<WeeklySchedule> findByUserIdAndYearAndMonthAndWeekNumber(Long userId, Integer year, Integer month,
            Integer weekNumber);

    @Query("SELECT ws FROM WeeklySchedule ws WHERE ws.year = :year AND ws.month = :month " +
            "ORDER BY ws.userId, ws.weekNumber")
    List<WeeklySchedule> findByYearAndMonthOrderByUserIdAndWeekNumber(@Param("year") Integer year,
            @Param("month") Integer month);

    @Query("SELECT ws FROM WeeklySchedule ws WHERE ws.year = :year AND ws.month = :month " +
            "AND (:userId IS NULL OR ws.userId = :userId) " +
            "ORDER BY ws.userId, ws.weekNumber")
    List<WeeklySchedule> findByFilters(@Param("year") Integer year,
            @Param("month") Integer month,
            @Param("userId") Long userId);

    @Query("SELECT ws FROM WeeklySchedule ws WHERE ws.year = :year AND ws.month = :month " +
            "AND (:userId IS NULL OR ws.userId = :userId) " +
            "ORDER BY ws.userId, ws.weekNumber")
    Page<WeeklySchedule> findPaginatedByFilters(@Param("year") Integer year,
            @Param("month") Integer month,
            @Param("userId") Long userId,
            Pageable pageable);

    @Query("SELECT COUNT(ws) FROM WeeklySchedule ws WHERE ws.userId = :userId AND ws.year = :year AND ws.month = :month")
    Long countByUserAndMonth(@Param("userId") Long userId, @Param("year") Integer year, @Param("month") Integer month);

    boolean existsByUserIdAndYearAndMonthAndWeekNumber(Long userId, Integer year, Integer month, Integer weekNumber);
}
