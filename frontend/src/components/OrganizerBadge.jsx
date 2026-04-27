import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

// Module-level cache shared by every instance in the app
const profileCache = new Map(); // organizerId -> Promise<profile | null>

const loadProfile = (organizerId) => {
    if (!profileCache.has(organizerId)) {
        profileCache.set(
            organizerId,
            api
                .get(`/api/users/profile/${organizerId}`)
                .then((res) => res.data.data)
                .catch(() => null)
        );
    }
    return profileCache.get(organizerId);
};

const sizeMap = {
    sm: { avatar: 'h-7 w-7 text-xs', name: 'text-xs', company: 'text-[11px]' },
    md: { avatar: 'h-10 w-10 text-sm', name: 'text-sm', company: 'text-xs' }
};

const OrganizerBadge = ({ organizerId, size = 'sm', className = '' }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        if (!organizerId) return;
        let active = true;
        loadProfile(organizerId).then((data) => {
            if (active) setProfile(data);
        });
        return () => {
            active = false;
        };
    }, [organizerId]);

    if (!organizerId) return null;

    const s = sizeMap[size] || sizeMap.sm;
    const displayName = profile?.displayName || 'Organizer';
    const companyName = profile?.organizerProfile?.companyName;
    const initial = displayName?.[0]?.toUpperCase() || 'O';

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/organizers/${organizerId}`);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/organizers/${organizerId}`);
        }
    };

    return (
        <span
            role="link"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full text-ink/80 transition hover:text-ink ${className}`}
        >
            {profile?.avatarUrl ? (
                <img
                    src={profile.avatarUrl}
                    alt={displayName}
                    className={`${s.avatar} rounded-full object-cover ring-2 ring-white`}
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            ) : (
                <span
                    className={`${s.avatar} flex items-center justify-center rounded-full bg-gradient-to-br from-reef/40 to-dusk/40 font-semibold text-ink ring-2 ring-white`}
                >
                    {initial}
                </span>
            )}
            <span className="flex flex-col leading-tight">
                <span className={`${s.name} font-semibold text-ink`}>
                    {companyName || displayName}
                </span>
                <span className={`${s.company} text-ink/50`}>View organizer</span>
            </span>
        </span>
    );
};

export default OrganizerBadge;
