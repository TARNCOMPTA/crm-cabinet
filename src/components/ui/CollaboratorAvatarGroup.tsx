import { memo } from 'react';
import { CollaboratorAvatar } from './CollaboratorAvatar';

interface Collaborator {
  user_id: string;
  full_name: string;
  // `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable.
  role?: string | null;
  avatar_color?: string | null;
}

interface CollaboratorAvatarGroupProps {
  collaborators: Collaborator[];
  maxDisplay?: number;
  size?: 'small' | 'medium' | 'large';
  emptyText?: string;
}

export const CollaboratorAvatarGroup = memo(function CollaboratorAvatarGroup({
  collaborators,
  maxDisplay = 4,
  size = 'medium',
  emptyText = 'Non assigne'
}: CollaboratorAvatarGroupProps) {
  if (!collaborators || collaborators.length === 0) {
    return (
      <span className="text-sm text-gray-500 italic">
        {emptyText}
      </span>
    );
  }

  const displayedCollaborators = collaborators.slice(0, maxDisplay);
  const remainingCount = collaborators.length - maxDisplay;

  const sizeClasses = {
    small: 'w-6 h-6 text-xs',
    medium: 'w-8 h-8 text-sm',
    large: 'w-12 h-12 text-base'
  };

  return (
    <div className="flex items-center -space-x-2">
      {displayedCollaborators.map((collaborator) => (
        <div key={collaborator.user_id} className="relative">
          <CollaboratorAvatar
            userId={collaborator.user_id}
            fullName={collaborator.full_name}
            avatarColor={collaborator.avatar_color}
            size={size}
            role={collaborator.role ?? undefined}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="relative group">
          <div
            className={`${sizeClasses[size]} rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-semibold border-2 border-white`}
          >
            +{remainingCount}
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
            {collaborators.slice(maxDisplay).map(c => c.full_name).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
});
