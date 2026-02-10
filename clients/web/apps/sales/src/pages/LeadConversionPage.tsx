import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import LeadConversionWizard from '../components/LeadConversionWizard';
import type { Lead, APIResponse } from '../types';

// Fallback lead data when API is unavailable
const SAMPLE_LEADS: Record<string, Lead> = {
  'lead-001': {
    _id: 'lead-001',
    company_name: 'Acme Corporation',
    contact_name: 'John Smith',
    contact_email: 'john.smith@acme.com',
    contact_phone: '(555) 123-4567',
    source: 'Website',
    status: 'QUALIFIED',
    score: {
      total: 85,
      factors: { company_size: 20, industry_fit: 25, engagement: 22, timing: 18 },
    },
    owner_id: 'user-001',
    owner_name: 'Test User',
    industry: 'Technology',
    company_size: '51-200',
    notes: 'Interested in enterprise plan',
    last_activity_date: '2026-01-10T14:30:00Z',
    created_at: '2025-12-15T10:00:00Z',
    updated_at: '2026-01-10T14:30:00Z',
  },
};

export default function LeadConversionPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/sales/get_lead?leadId=${leadId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch lead');
      return res.json() as Promise<APIResponse<Lead>>;
    },
    enabled: !!leadId,
  });

  // Use API data, fall back to sample lead
  const lead = response?.data || (leadId ? SAMPLE_LEADS[leadId] : undefined);

  if (isLoading && !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-600 mb-4">
            {error ? (error as Error).message : 'Lead not found'}
          </p>
          <button onClick={() => navigate('/leads')} className="btn-primary">
            Back to Leads
          </button>
        </div>
      </div>
    );
  }

  return (
    <LeadConversionWizard
      lead={lead}
      onClose={() => navigate('/leads')}
      onComplete={() => {
        navigate('/opportunities');
      }}
    />
  );
}
