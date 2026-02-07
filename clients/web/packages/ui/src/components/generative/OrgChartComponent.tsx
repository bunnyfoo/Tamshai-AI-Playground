/**
 * OrgChartComponent - Organizational Chart Display
 *
 * Displays hierarchical employee relationships in a 3-row layout:
 * - Top row: Manager (if present)
 * - Middle row: Self and peers
 * - Bottom row: Direct reports
 *
 * Features:
 * - EmployeeCard sub-component with name, title, avatar
 * - Self card highlighting with "You" badge
 * - Click handling for navigation
 * - Loading, error, and empty states
 * - Full keyboard accessibility
 */
import { useCallback, KeyboardEvent } from 'react';

/**
 * Employee data structure
 */
export interface Employee {
  /** Unique employee identifier */
  id: string;
  /** Employee full name */
  name: string;
  /** Job title */
  title: string;
  /** Email address (optional) */
  email?: string;
  /** Avatar image URL (optional) */
  avatarUrl?: string;
}

/**
 * Props for OrgChartComponent
 */
export interface OrgChartComponentProps {
  /** The manager employee (optional) */
  manager?: Employee;
  /** The current user (self) */
  self: Employee;
  /** Peer employees at the same level */
  peers: Employee[];
  /** Direct reports under the current user */
  directReports: Employee[];
  /** Callback when an employee card is clicked */
  onEmployeeClick?: (employee: Employee) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Show empty state messages */
  showEmptyStates?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Compact display mode */
  compact?: boolean;
}

/**
 * Props for EmployeeCard sub-component
 */
interface EmployeeCardProps {
  employee: Employee;
  isSelf?: boolean;
  isClickable?: boolean;
  onClick?: (employee: Employee) => void;
}

/**
 * EmployeeCard - Individual employee display card
 */
function EmployeeCard({
  employee,
  isSelf = false,
  isClickable = false,
  onClick,
}: EmployeeCardProps): JSX.Element {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(employee);
    }
  }, [onClick, employee]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((event.key === 'Enter' || event.key === ' ') && onClick) {
        event.preventDefault();
        onClick(employee);
      }
    },
    [onClick, employee]
  );

  const cardClasses = [
    'employee-card',
    isSelf ? 'highlighted' : '',
    isClickable ? 'cursor-pointer' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-testid={`employee-card-${employee.id}`}
      className={cardClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${employee.name}, ${employee.title}`}
      aria-current={isSelf ? 'true' : undefined}
    >
      {/* Avatar */}
      {employee.avatarUrl ? (
        <img
          src={employee.avatarUrl}
          alt={employee.name}
          className="employee-avatar"
        />
      ) : (
        <div data-testid="default-avatar" className="employee-avatar-default">
          {employee.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()}
        </div>
      )}

      {/* Employee Info */}
      <div className="employee-info">
        <div className="employee-name">
          {employee.name}
          {isSelf && <span className="self-badge">You</span>}
        </div>
        <div className="employee-title">{employee.title}</div>
        {employee.email && (
          <div className="employee-email">{employee.email}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton loader for loading state
 */
function OrgChartSkeleton(): JSX.Element {
  return (
    <div data-testid="org-chart-skeleton" className="org-chart-skeleton">
      <div className="skeleton-row">
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-row">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-row">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </div>
  );
}

/**
 * Error display component
 */
function OrgChartError({ message }: { message: string }): JSX.Element {
  return (
    <div data-testid="org-chart-error" className="org-chart-error">
      <div className="error-icon">!</div>
      <div className="error-message">{message}</div>
    </div>
  );
}

/**
 * OrgChartComponent - Main component
 */
export function OrgChartComponent({
  manager,
  self,
  peers,
  directReports,
  onEmployeeClick,
  loading = false,
  error,
  showEmptyStates = false,
  className = '',
  compact = false,
}: OrgChartComponentProps): JSX.Element {
  const containerClasses = ['org-chart', className, compact ? 'compact' : '']
    .filter(Boolean)
    .join(' ');

  const isClickable = !!onEmployeeClick;
  const teamCount = 1 + peers.length; // self + peers

  // Loading state
  if (loading) {
    return (
      <div data-testid="org-chart" className={containerClasses}>
        <h2>Organization Chart</h2>
        <OrgChartSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div data-testid="org-chart" className={containerClasses}>
        <h2>Organization Chart</h2>
        <OrgChartError message={error} />
      </div>
    );
  }

  // Determine which rows to show
  const showManagerRow = manager || showEmptyStates;
  const showReportsRow = directReports.length > 0 || showEmptyStates;

  return (
    <div data-testid="org-chart" className={containerClasses}>
      <h2>Organization Chart</h2>

      {/* Manager Row */}
      {showManagerRow && (
        <section
          data-testid="org-chart-manager-row"
          className="org-chart-row manager-row"
          role="region"
          aria-label="Manager"
        >
          {manager ? (
            <>
              <EmployeeCard
                employee={manager}
                isClickable={isClickable}
                onClick={onEmployeeClick}
              />
              {/* Connection line to self row */}
              <div
                data-testid="connection-line-manager-self"
                className="connection-line vertical"
              />
            </>
          ) : (
            <div className="empty-state">No manager assigned</div>
          )}
        </section>
      )}

      {/* Self and Peers Row */}
      <section
        data-testid="org-chart-self-row"
        className="org-chart-row self-row"
        role="region"
        aria-label="Team members"
      >
        <div className="row-header">Team ({teamCount})</div>
        <div className="row-cards">
          {/* Self card first */}
          <EmployeeCard
            employee={self}
            isSelf={true}
            isClickable={isClickable}
            onClick={onEmployeeClick}
          />

          {/* Peer cards */}
          {peers.map((peer) => (
            <EmployeeCard
              key={peer.id}
              employee={peer}
              isClickable={isClickable}
              onClick={onEmployeeClick}
            />
          ))}

          {/* Empty state for no peers */}
          {peers.length === 0 && showEmptyStates && (
            <div className="empty-state">No peers</div>
          )}
        </div>
      </section>

      {/* Direct Reports Row */}
      {showReportsRow && (
        <section
          data-testid="org-chart-reports-row"
          className="org-chart-row reports-row"
          role="region"
          aria-label="Direct reports"
        >
          {directReports.length > 0 ? (
            <>
              {/* Connection line from self */}
              <div
                data-testid="connection-line-self-reports"
                className="connection-line vertical"
              />
              <div className="row-header">
                Direct Reports ({directReports.length})
              </div>
              <div className="row-cards">
                {directReports.map((report) => (
                  <EmployeeCard
                    key={report.id}
                    employee={report}
                    isClickable={isClickable}
                    onClick={onEmployeeClick}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">No direct reports</div>
          )}
        </section>
      )}
    </div>
  );
}

export default OrgChartComponent;
