/// Generative UI components for AI-driven dynamic interface rendering.
///
/// This library provides widgets and models for rendering rich, interactive
/// UI components based on AI responses. The ComponentRenderer widget maps
/// component type strings to Flutter widgets and handles the routing of
/// user actions back to the AI.
///
/// Example usage:
/// ```dart
/// import 'package:unified_flutter/features/generative/generative.dart';
///
/// ComponentRenderer(
///   component: ComponentResponse(
///     type: 'OrgChartComponent',
///     props: {'self': {'id': 'user-123', 'name': 'Marcus Johnson'}},
///   ),
///   onAction: (action) => print('Action: ${action.actionType}'),
///   voiceEnabled: true,
/// )
/// ```
library generative;

// Models
export 'models/component_response.dart';
export 'models/employee.dart';

// Services
export 'services/display_service.dart';

// Widgets
export 'widgets/component_renderer.dart';
export 'widgets/org_chart_component.dart';
export 'widgets/approvals_queue.dart';
export 'widgets/customer_detail_card.dart';
export 'widgets/budget_summary_card.dart';
export 'widgets/leads_data_table.dart';
