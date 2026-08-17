package com.example.marketingservice.controller.user;

import com.example.marketingservice.dto.user.MarketingUserProfileRequest;
import com.example.marketingservice.dto.user.MarketingUserProfileResponse;
import com.example.marketingservice.service.user.MarketingUserProfileService;
import com.example.marketingservice.service.shared.MarketingAuthorizationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/marketing/users/profile")
public class MarketingUserProfileController {

    @Autowired
    private MarketingUserProfileService profileService;

    @Autowired
    private MarketingAuthorizationService authorizationService;

    @GetMapping("/{userId}")
    public ResponseEntity<MarketingUserProfileResponse> getUserProfile(@PathVariable Long userId) {
        // Any authenticated user can view a profile (needed for displaying signatures on shared reports)
        MarketingUserProfileResponse profile = profileService.getProfileByUserId(userId);
        if (profile == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(profile);
    }

    @GetMapping("/me")
    public ResponseEntity<MarketingUserProfileResponse> getCurrentUserProfile() {
        Long currentUserId = authorizationService.getCurrentUserId();
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        MarketingUserProfileResponse profile = profileService.getProfileByUserId(currentUserId);
        if (profile == null) {
            // Return empty profile for new users
            MarketingUserProfileResponse emptyProfile = new MarketingUserProfileResponse();
            emptyProfile.setUserId(currentUserId);
            return ResponseEntity.ok(emptyProfile);
        }
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me")
    public ResponseEntity<MarketingUserProfileResponse> updateCurrentUserProfile(
            @RequestBody MarketingUserProfileRequest request) {
        Long currentUserId = authorizationService.getCurrentUserId();
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        MarketingUserProfileResponse updatedProfile = profileService.createOrUpdateProfile(currentUserId, request);
        return ResponseEntity.ok(updatedProfile);
    }

    @PutMapping("/{userId}")
    public ResponseEntity<MarketingUserProfileResponse> updateUserProfile(
            @PathVariable Long userId,
            @RequestBody MarketingUserProfileRequest request) {
        // Only admins can update other users' profiles
        if (!authorizationService.canManageUsers()) {
            return ResponseEntity.status(403).build();
        }

        MarketingUserProfileResponse updatedProfile = profileService.createOrUpdateProfile(userId, request);
        return ResponseEntity.ok(updatedProfile);
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> deleteUserProfile(@PathVariable Long userId) {
        // Only admins can delete profiles
        if (!authorizationService.canManageUsers()) {
            return ResponseEntity.status(403).build();
        }

        profileService.deleteProfile(userId);
        return ResponseEntity.noContent().build();
    }
}
