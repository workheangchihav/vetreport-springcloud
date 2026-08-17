package com.example.marketingservice.service.member;

import com.example.marketingservice.dto.member.VipMemberDashboardResponse;
import com.example.marketingservice.dto.member.VipMemberPaginatedResponse;
import com.example.marketingservice.dto.member.PaginatedVipMemberResponse;
import com.example.marketingservice.dto.member.VipMemberRequest;
import com.example.marketingservice.entity.branch.MarketingBranch;
import com.example.marketingservice.entity.member.VipMember;
import com.example.marketingservice.exception.ResourceNotFoundException;
import com.example.marketingservice.repository.branch.MarketingBranchRepository;
import com.example.marketingservice.repository.member.VipMemberRepository;
import com.example.marketingservice.service.shared.MarketingAuthorizationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class VipMemberService {

    private final VipMemberRepository vipMemberRepository;
    private final MarketingBranchRepository branchRepository;

    @Autowired
    private MarketingAuthorizationService authorizationService;

    public VipMemberService(VipMemberRepository vipMemberRepository,
            MarketingBranchRepository branchRepository) {
        this.vipMemberRepository = vipMemberRepository;
        this.branchRepository = branchRepository;
    }

    @Transactional(readOnly = true)
    public List<VipMember> findAll(Long areaId, Long subAreaId, Long branchId) {
        if (branchId != null) {
            return vipMemberRepository.findByBranchId(branchId);
        }
        if (subAreaId != null) {
            return vipMemberRepository.findByBranch_SubArea_Id(subAreaId);
        }
        if (areaId != null) {
            return vipMemberRepository.findByBranch_Area_Id(areaId);
        }
        return vipMemberRepository.findAll();
    }

    @Transactional(readOnly = true)
    public List<VipMember> findAllForUser(Long userId, Long areaId, Long subAreaId, Long branchId) {
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);

        List<VipMember> members;
        if (branchId != null) {
            members = vipMemberRepository.findByBranchId(branchId);
        } else if (subAreaId != null) {
            members = vipMemberRepository.findByBranch_SubArea_Id(subAreaId);
        } else if (areaId != null) {
            members = vipMemberRepository.findByBranch_Area_Id(areaId);
        } else {
            members = vipMemberRepository.findAll();
        }

        if (accessibleBranchIds == null && accessibleSubAreaIds == null && accessibleAreaIds == null) {
            return members;
        }

        return members.stream()
                .filter(member -> {
                    if (accessibleBranchIds != null && !accessibleBranchIds.isEmpty()) {
                        return member.getBranch() != null &&
                                accessibleBranchIds.contains(member.getBranch().getId());
                    }
                    if (accessibleSubAreaIds != null && !accessibleSubAreaIds.isEmpty()) {
                        return member.getBranch() != null &&
                                member.getBranch().getSubArea() != null &&
                                accessibleSubAreaIds.contains(member.getBranch().getSubArea().getId());
                    }
                    if (accessibleAreaIds != null && !accessibleAreaIds.isEmpty()) {
                        return member.getBranch() != null &&
                                member.getBranch().getArea() != null &&
                                accessibleAreaIds.contains(member.getBranch().getArea().getId());
                    }
                    return false;
                })
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public VipMember getById(Long id) {
        return vipMemberRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("VIP member not found: " + id));
    }

    @Transactional
    public VipMember create(VipMemberRequest request, Long creatorId) {
        // Normalize phone number by removing spaces
        String normalizedPhone = request.getPhone() != null ? request.getPhone().replaceAll("\\s", "") : null;

        // Check if phone number already exists
        if (normalizedPhone != null && vipMemberRepository.findByPhone(normalizedPhone) != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "VIP member with phone number " + normalizedPhone + " already exists");
        }

        if (request.getBranchId() != null) {
            MarketingBranch branch = branchRepository.findById(request.getBranchId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Marketing branch not found: " + request.getBranchId()));

            if (!authorizationService.canCreateBranch(creatorId,
                    branch.getArea().getId(),
                    branch.getSubArea() != null ? branch.getSubArea().getId() : null)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "You don't have permission to create VIP members in this branch.");
            }
        }

        VipMember member = new VipMember();
        applyRequest(member, request);
        member.setCreatedBy(creatorId);
        return vipMemberRepository.save(member);
    }

    @Transactional
    public List<VipMember> createBatch(List<VipMemberRequest> requests, Long creatorId) {
        List<VipMember> createdMembers = new java.util.ArrayList<>();

        for (VipMemberRequest request : requests) {
            try {
                // Normalize phone number by removing spaces
                String normalizedPhone = request.getPhone() != null ? request.getPhone().replaceAll("\\s", "") : null;

                // Check if phone number already exists, skip if it does
                if (normalizedPhone != null && vipMemberRepository.findByPhone(normalizedPhone) != null) {
                    continue; // Skip existing member
                }

                if (request.getBranchId() != null) {
                    MarketingBranch branch = branchRepository.findById(request.getBranchId())
                            .orElseThrow(() -> new ResourceNotFoundException(
                                    "Marketing branch not found: " + request.getBranchId()));

                    if (!authorizationService.canCreateBranch(creatorId,
                            branch.getArea().getId(),
                            branch.getId())) {
                        continue; // Skip if no permission
                    }
                } else {
                    // Create without branch assignment
                }

                VipMember member = new VipMember();
                applyRequest(member, request);
                member.setCreatedBy(creatorId);
                VipMember savedMember = vipMemberRepository.save(member);
                createdMembers.add(savedMember);
            } catch (Exception e) {
                // Log error but continue with other members
                System.err.println("Error creating member: " + e.getMessage());
            }
        }

        return createdMembers;
    }

    @Transactional
    public VipMember update(Long id, VipMemberRequest request, Long userId) {
        VipMember member = getById(id);
        validateManagePermission(userId, member);
        applyRequest(member, request);
        return vipMemberRepository.save(member);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        VipMember member = getById(id);
        validateManagePermission(userId, member);
        vipMemberRepository.deleteById(id);
    }

    private void validateManagePermission(Long userId, VipMember member) {
        if (authorizationService.isRootUser(userId)) {
            return;
        }

        if (authorizationService.isCreator(userId, member.getCreatedBy())) {
            return;
        }

        if (member.getBranch() != null) {
            Long areaId = member.getBranch().getArea() != null ? member.getBranch().getArea().getId() : null;
            if (authorizationService.canCreateBranch(userId, areaId, member.getBranch().getId())) {
                return;
            }
        }

        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "You don't have permission to modify this VIP member. Only the creator or branch members can manage it.");
    }

    private void applyRequest(VipMember member, VipMemberRequest request) {
        member.setName(request.getName());
        // Normalize phone number by removing spaces
        String normalizedPhone = request.getPhone() != null ? request.getPhone().replaceAll("\\s", "") : null;
        member.setPhone(normalizedPhone);
        member.setMemberCreatedAt(request.getMemberCreatedAt());
        member.setMemberDeletedAt(request.getMemberDeletedAt());
        member.setCreateRemark(request.getCreateRemark());
        member.setDeleteRemark(request.getDeleteRemark());

        if (request.getBranchId() != null) {
            MarketingBranch branch = branchRepository.findById(request.getBranchId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Marketing branch not found: " + request.getBranchId()));
            member.setBranch(branch);
        }
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "vipMemberDashboard", key = "T(String).format('%d-%d-%d-%d-%s-%s', #userId, #areaId, #subAreaId, #branchId, #startDate, #endDate)")
    public VipMemberDashboardResponse getDashboardData(Long userId, Long areaId, Long subAreaId, Long branchId,
            LocalDate startDate, LocalDate endDate) {
        // Get user's accessible areas, sub-areas, and branches
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);

        // Apply user access filters to the requested filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Get basic counts
        long totalMembers = vipMemberRepository.count();
        long activeMembers = vipMemberRepository.countActiveMembers();

        // Get hierarchical counts with filters
        HashMap<String, Long> areaCounts = new HashMap<>();
        HashMap<String, Long> subAreaCounts = new HashMap<>();
        HashMap<String, Long> branchCounts = new HashMap<>();

        List<Object[]> areaResults = vipMemberRepository.countMembersByAreaWithFilters(filteredAreaId,
                filteredSubAreaId, filteredBranchId);
        areaResults.forEach(row -> areaCounts.put(row[0].toString(), (Long) row[1]));

        List<Object[]> subAreaResults = vipMemberRepository.countMembersBySubAreaWithFilters(filteredAreaId,
                filteredSubAreaId, filteredBranchId);
        subAreaResults.forEach(row -> subAreaCounts.put(row[0].toString(), (Long) row[1]));

        List<Object[]> branchResults = vipMemberRepository.countMembersByBranchWithFilters(filteredAreaId,
                filteredSubAreaId, filteredBranchId);
        branchResults.forEach(row -> branchCounts.put(row[0].toString(), (Long) row[1]));

        // Get trend data
        List<VipMemberDashboardResponse.DailyCount> dailyCounts = List.of();
        List<VipMemberDashboardResponse.WeeklyCount> weeklyCounts = List.of();
        List<VipMemberDashboardResponse.MonthlyCount> monthlyCounts = List.of();

        if (startDate != null && endDate != null) {
            // Use only filtered queries for now
            List<Object[]> dailyResults = vipMemberRepository.countMembersByDateBetweenWithFilters(startDate, endDate,
                    filteredAreaId, filteredSubAreaId, filteredBranchId);
            dailyCounts = dailyResults.stream()
                    .map(row -> new VipMemberDashboardResponse.DailyCount(
                            row[0].toString(), (Long) row[1]))
                    .collect(Collectors.toList());

            List<Object[]> weeklyResults = vipMemberRepository.countMembersByWeekBetweenWithFilters(startDate, endDate,
                    filteredAreaId, filteredSubAreaId, filteredBranchId);
            weeklyCounts = weeklyResults.stream()
                    .map(row -> {
                        String year = row[0].toString();
                        String week = row[1].toString();
                        String yearWeek = year + "-W" + (week.length() == 1 ? "0" + week : week);
                        return new VipMemberDashboardResponse.WeeklyCount(yearWeek, yearWeek, (Long) row[2]);
                    })
                    .collect(Collectors.toList());

            List<Object[]> monthlyResults = vipMemberRepository.countMembersByMonthBetweenWithFilters(startDate,
                    endDate,
                    filteredAreaId, filteredSubAreaId, filteredBranchId);
            monthlyCounts = monthlyResults.stream()
                    .map(row -> {
                        String year = row[0].toString();
                        String month = row[1].toString();
                        String monthStr = LocalDate.of(Integer.parseInt(year), Integer.parseInt(month), 1)
                                .format(DateTimeFormatter.ofPattern("MMM yyyy"));
                        String yearMonth = year + "-" + (month.length() == 1 ? "0" + month : month);
                        return new VipMemberDashboardResponse.MonthlyCount(monthStr, yearMonth, (Long) row[2]);
                    })
                    .collect(Collectors.toList());
        } else {
            System.out.println("DEBUG: startDate or endDate is null");
        }

        // Get date range
        LocalDate earliestDate = vipMemberRepository.findEarliestMemberCreatedAt();
        LocalDate latestDate = vipMemberRepository.findLatestMemberCreatedAt();

        return new VipMemberDashboardResponse(
                areaCounts,
                subAreaCounts,
                branchCounts,
                dailyCounts,
                weeklyCounts,
                monthlyCounts,
                earliestDate,
                latestDate,
                totalMembers,
                activeMembers);
    }

    private Long applyAccessFilter(Long requestedFilter, List<Long> accessibleIds) {
        if (accessibleIds == null || accessibleIds.isEmpty()) {
            // User has access to all (root user or admin)
            return requestedFilter;
        }

        if (requestedFilter == null) {
            // No specific filter requested, user can only see their accessible items
            return null;
        }

        // Specific filter requested, check if user has access
        return accessibleIds.contains(requestedFilter) ? requestedFilter : null;
    }

    public Page<VipMember> getPaginatedMembers(Long userId, int page, int size, Long areaId, Long subAreaId,
            Long branchId, LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Create a specification for filtering
        Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

        // Add area filter
        if (filteredAreaId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.or(
                        cb.equal(root.get("areaId"), filteredAreaId),
                        cb.equal(root.join("branch").get("area").get("id"), filteredAreaId));
            });
        }

        // Add subArea filter
        if (filteredSubAreaId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.or(
                        cb.equal(root.get("subAreaId"), filteredSubAreaId),
                        cb.equal(root.join("branch").get("subArea").get("id"), filteredSubAreaId));
            });
        }

        // Add branch filter
        if (filteredBranchId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.equal(root.get("branchId"), filteredBranchId);
            });
        }

        // Add date range filter
        if (startDate != null && endDate != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.between(root.get("memberCreatedAt"), startDate, endDate);
            });
        }

        // Only show active members (not deleted)
        spec = spec.and((root, query, cb) -> {
            return cb.isNull(root.get("memberDeletedAt"));
        });

        Pageable pageable = PageRequest.of(page, size, Sort.by("memberCreatedAt").descending());
        return vipMemberRepository.findAll(spec, pageable);
    }

    public List<VipMember> getAllMembersOptimized(Long userId, int page, int size, Long areaId, Long subAreaId,
            Long branchId,
            LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        int offset = page * size;
        List<VipMember> members;

        // Use optimized native queries for better performance
        if (filteredBranchId != null) {
            members = vipMemberRepository.findByBranchIdPaginated(filteredBranchId, offset, size);
        } else if (filteredSubAreaId != null) {
            members = vipMemberRepository.findBySubAreaIdPaginated(filteredSubAreaId, offset, size);
        } else if (filteredAreaId != null) {
            members = vipMemberRepository.findByAreaIdPaginated(filteredAreaId, offset, size);
        } else {
            // Use specification for complex queries with date filters
            Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

            // Add date range filter
            if (startDate != null && endDate != null) {
                spec = spec.and((root, query, cb) -> {
                    return cb.between(root.get("memberCreatedAt"), startDate, endDate);
                });
            }

            Pageable pageable = PageRequest.of(page, size, Sort.by("memberCreatedAt").descending());
            Page<VipMember> pageResult = vipMemberRepository.findAll(spec, pageable);
            return pageResult.getContent();
        }

        // Apply date filtering if needed (for simple cases)
        if (startDate != null && endDate != null) {
            members = members.stream()
                    .filter(member -> member.getMemberCreatedAt() != null &&
                            !member.getMemberCreatedAt().isBefore(startDate) &&
                            !member.getMemberCreatedAt().isAfter(endDate))
                    .collect(Collectors.toList());
        }

        return members;
    }

    public Page<VipMember> getAllMembers(Long userId, int page, int size, Long areaId, Long subAreaId, Long branchId,
            LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Create a specification for filtering
        Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

        // Add area filter
        if (filteredAreaId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.or(
                        cb.equal(root.get("areaId"), filteredAreaId),
                        cb.equal(root.join("branch").get("area").get("id"), filteredAreaId));
            });
        }

        // Add subArea filter
        if (filteredSubAreaId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.or(
                        cb.equal(root.get("subAreaId"), filteredSubAreaId),
                        cb.equal(root.join("branch").get("subArea").get("id"), filteredSubAreaId));
            });
        }

        // Add branch filter
        if (filteredBranchId != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.equal(root.get("branchId"), filteredBranchId);
            });
        }

        // Add date range filter
        if (startDate != null && endDate != null) {
            spec = spec.and((root, query, cb) -> {
                return cb.between(root.get("memberCreatedAt"), startDate, endDate);
            });
        }

        // For all members, include both active and deleted members to show complete
        // history
        // Don't filter by memberDeletedAt

        Pageable pageable = PageRequest.of(page, size, Sort.by("memberCreatedAt").descending());
        return vipMemberRepository.findAll(spec, pageable);
    }

    @Transactional(readOnly = true)
    public PaginatedVipMemberResponse getAllMembersPaginated(Long userId, int page, int size, Long areaId,
            Long subAreaId,
            Long branchId, LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Build specification for filtering
        Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

        if (filteredBranchId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("branch").get("id"), filteredBranchId));
        } else if (filteredSubAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("subArea").get("id"), filteredSubAreaId));
        } else if (filteredAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("area").get("id"), filteredAreaId));
        }

        if (startDate != null) {
            spec = spec.and((root, q, cb) -> cb.greaterThanOrEqualTo(root.get("memberCreatedAt"), startDate));
        }

        if (endDate != null) {
            spec = spec.and((root, q, cb) -> cb.lessThanOrEqualTo(root.get("memberCreatedAt"), endDate));
        }

        // Get total count
        long totalCount = vipMemberRepository.count(spec);

        // Get paginated results
        Pageable pageable = PageRequest.of(page, size, Sort.by("memberCreatedAt").descending());
        Page<VipMember> pageResult = vipMemberRepository.findAll(spec, pageable);

        List<VipMemberPaginatedResponse> responseList = pageResult.getContent().stream()
                .map(VipMemberPaginatedResponse::fromEntity)
                .toList();

        return new PaginatedVipMemberResponse(responseList, totalCount, page, size);
    }

    @Transactional(readOnly = true)
    public PaginatedVipMemberResponse getActiveMembersPaginated(Long userId, int page, int size, Long areaId,
            Long subAreaId,
            Long branchId, LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Build specification for filtering - only active members
        Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

        if (filteredBranchId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("branch").get("id"), filteredBranchId));
        } else if (filteredSubAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("subArea").get("id"), filteredSubAreaId));
        } else if (filteredAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("area").get("id"), filteredAreaId));
        }

        if (startDate != null) {
            spec = spec.and((root, q, cb) -> cb.greaterThanOrEqualTo(root.get("memberCreatedAt"), startDate));
        }

        if (endDate != null) {
            spec = spec.and((root, q, cb) -> cb.lessThanOrEqualTo(root.get("memberCreatedAt"), endDate));
        }

        // Only active members (not deleted)
        spec = spec.and((root, q, cb) -> cb.isNull(root.get("memberDeletedAt")));

        // Get total count
        long totalCount = vipMemberRepository.count(spec);

        // Get paginated results
        Pageable pageable = PageRequest.of(page, size, Sort.by("memberCreatedAt").descending());
        Page<VipMember> pageResult = vipMemberRepository.findAll(spec, pageable);

        List<VipMemberPaginatedResponse> responseList = pageResult.getContent().stream()
                .map(VipMemberPaginatedResponse::fromEntity)
                .toList();

        return new PaginatedVipMemberResponse(responseList, totalCount, page, size);
    }

    @Transactional(readOnly = true)
    public PaginatedVipMemberResponse getRemovedMembersPaginated(Long userId, int page, int size, Long areaId,
            Long subAreaId,
            Long branchId, LocalDate startDate, LocalDate endDate) {
        // Get user access permissions
        List<Long> accessibleAreaIds = authorizationService.getAccessibleAreaIds(userId);
        List<Long> accessibleSubAreaIds = authorizationService.getAccessibleSubAreaIds(userId);
        List<Long> accessibleBranchIds = authorizationService.getAccessibleBranchIds(userId);

        // Apply access control filters
        Long filteredAreaId = applyAccessFilter(areaId, accessibleAreaIds);
        Long filteredSubAreaId = applyAccessFilter(subAreaId, accessibleSubAreaIds);
        Long filteredBranchId = applyAccessFilter(branchId, accessibleBranchIds);

        // Build specification for filtering - only removed members
        Specification<VipMember> spec = Specification.where((root, query, cb) -> cb.conjunction());

        if (filteredBranchId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("branch").get("id"), filteredBranchId));
        } else if (filteredSubAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("subArea").get("id"), filteredSubAreaId));
        } else if (filteredAreaId != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.join("branch").get("area").get("id"), filteredAreaId));
        }

        if (startDate != null) {
            spec = spec.and((root, q, cb) -> cb.greaterThanOrEqualTo(root.get("memberCreatedAt"), startDate));
        }

        if (endDate != null) {
            spec = spec.and((root, q, cb) -> cb.lessThanOrEqualTo(root.get("memberCreatedAt"), endDate));
        }

        // Only removed members (deleted)
        spec = spec.and((root, q, cb) -> cb.isNotNull(root.get("memberDeletedAt")));

        // Get total count
        long totalCount = vipMemberRepository.count(spec);

        // Get paginated results
        Pageable pageable = PageRequest.of(page, size, Sort.by("memberDeletedAt").descending());
        Page<VipMember> pageResult = vipMemberRepository.findAll(spec, pageable);

        List<VipMemberPaginatedResponse> responseList = pageResult.getContent().stream()
                .map(VipMemberPaginatedResponse::fromEntity)
                .toList();

        return new PaginatedVipMemberResponse(responseList, totalCount, page, size);
    }
}
