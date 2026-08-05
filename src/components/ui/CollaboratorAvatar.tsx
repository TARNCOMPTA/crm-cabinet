import { memo } from 'react';
import { getCollaboratorInitials, getCollaboratorColor, getContrastColor } from '../../lib/collaboratorUtils';

interface CollaboratorAvatarProps {
  userId?: string;
  fullName?: string;
  name?: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  size?: 'small' | 'medium' | 'large' | 'sm';
  showTooltip?: boolean;
  role?: string;
}

export const CollaboratorAvatar = memo(function CollaboratorAvatar({
  userId,
  fullName,
  name,
  avatarUrl,
  avatarColor,
  size = 'medium',
  showTooltip = true,
  role
}: CollaboratorAvatarProps) {
  const displayName = name || fullName || '';
  const displayId = userId || displayName;

  const initials = getCollaboratorInitials(displayName);
  const backgroundColor = getCollaboratorColor(displayId, avatarColor);
  const textColor = getContrastColor(backgroundColor);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    small: 'w-6 h-6 text-xs',
    medium: 'w-8 h-8 text-sm',
    large: 'w-12 h-12 text-base'
  };

  const tooltipText = role ? `${displayName} (${role})` : displayName;

  return (
    <div className="relative group inline-block">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`${sizeClasses[size]} rounded-full object-cover transition-transform hover:scale-110`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold transition-transform hover:scale-110`}
          style={{ backgroundColor, color: textColor }}
        >
          {initials}
        </div>
      )}
      {showTooltip && displayName && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
          {tooltipText}
        </div>
      )}
    </div>
  );
});
