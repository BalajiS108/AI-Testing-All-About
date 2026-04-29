import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { ExecutionReport } from './agent.js';

export async function generateExcelReport(report: ExecutionReport): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Intelligent Test Planning Agent';
    workbook.created = new Date();

    // ── Summary Sheet ──
    const summarySheet = workbook.addWorksheet('Summary', {
        properties: { tabColor: { argb: '3B82F6' } }
    });

    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 30 },
    ];

    // Header styling
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 12 };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } };

    const summaryRows = [
        { metric: 'Executed At', value: new Date(report.summary.executedAt).toLocaleString() },
        { metric: 'Total Test Cases', value: report.summary.total },
        { metric: 'Passed', value: report.summary.passed },
        { metric: 'Failed', value: report.summary.failed },
        { metric: 'Errors', value: report.summary.errors },
        { metric: 'Skipped', value: report.summary.skipped },
        { metric: 'Pass Rate', value: `${report.summary.total > 0 ? Math.round((report.summary.passed / report.summary.total) * 100) : 0}%` },
        { metric: 'Total Duration', value: `${(report.summary.duration / 1000).toFixed(1)}s` },
    ];
    summaryRows.forEach(r => summarySheet.addRow(r));

    // Color code pass/fail rows
    summarySheet.getRow(4).getCell(2).font = { bold: true, color: { argb: '16A34A' } }; // Passed
    summarySheet.getRow(5).getCell(2).font = { bold: true, color: { argb: 'DC2626' } }; // Failed

    // ── Detailed Results Sheet ──
    const detailSheet = workbook.addWorksheet('Test Results', {
        properties: { tabColor: { argb: '10B981' } }
    });

    detailSheet.columns = [
        { header: '#', key: 'id', width: 5 },
        { header: 'Test Case', key: 'name', width: 40 },
        { header: 'Jira Key', key: 'jiraKey', width: 15 },
        { header: 'Priority', key: 'priority', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Expected Result', key: 'expected', width: 40 },
        { header: 'Actual Result', key: 'actual', width: 40 },
        { header: 'Duration', key: 'duration', width: 12 },
        { header: 'Error', key: 'error', width: 30 },
    ];

    detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    detailSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '10B981' } };

    for (const r of report.results) {
        const row = detailSheet.addRow({
            id: r.id,
            name: r.name,
            jiraKey: r.jiraKey,
            priority: r.priority,
            status: r.status,
            expected: r.expectedResult,
            actual: r.actualResult,
            duration: `${(r.duration / 1000).toFixed(1)}s`,
            error: r.error || '',
        });

        // Status cell colors
        const statusCell = row.getCell(5);
        if (r.status === 'PASS') {
            statusCell.font = { bold: true, color: { argb: '16A34A' } };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };
        } else if (r.status === 'FAIL') {
            statusCell.font = { bold: true, color: { argb: 'DC2626' } };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
        } else if (r.status === 'ERROR') {
            statusCell.font = { bold: true, color: { argb: 'EA580C' } };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7ED' } };
        }

        // Priority cell colors
        const prioCell = row.getCell(4);
        if (r.priority.toLowerCase() === 'high') {
            prioCell.font = { bold: true, color: { argb: 'DC2626' } };
        } else if (r.priority.toLowerCase() === 'medium') {
            prioCell.font = { color: { argb: 'EA580C' } };
        }
    }

    // ── Step Details Sheet ──
    const stepsSheet = workbook.addWorksheet('Step Details', {
        properties: { tabColor: { argb: '8B5CF6' } }
    });

    stepsSheet.columns = [
        { header: 'TC #', key: 'tcId', width: 8 },
        { header: 'Test Case', key: 'tcName', width: 35 },
        { header: 'Step', key: 'step', width: 50 },
        { header: 'Result', key: 'result', width: 50 },
        { header: 'Passed', key: 'passed', width: 10 },
    ];

    stepsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    stepsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '8B5CF6' } };

    for (const r of report.results) {
        for (const s of r.steps) {
            const row = stepsSheet.addRow({
                tcId: r.id,
                tcName: r.name,
                step: s.step,
                result: s.result,
                passed: s.passed ? '✓' : '✗',
            });
            const passedCell = row.getCell(5);
            passedCell.font = { bold: true, color: { argb: s.passed ? '16A34A' : 'DC2626' } };
        }
    }

    // Save
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `TestReport_${Date.now()}.xlsx`;
    const filePath = path.join(reportsDir, filename);
    await workbook.xlsx.writeFile(filePath);
    console.log(`📊 Excel report saved: ${filePath}`);

    return filePath;
}
