import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { theme } from '../theme';
import type { TempSample } from '../logic/types';

interface Props {
  samples: TempSample[];
  targetDomeC: number;
  targetCoreC: number | null;
}

/** Liveline-stijl: strakke, vloeiende lijnen voor omgeving + vlees + doellijnen. */
export default function LiveChart({ samples, targetDomeC, targetCoreC }: Props) {
  const data = useMemo(() => {
    if (samples.length === 0) return [];
    const t0 = samples[0].t;
    return samples.map((s) => ({
      min: (s.t - t0) / 60000,
      ambient: s.ambientC ?? undefined,
      meat: s.meatC ?? undefined,
      targetDome: targetDomeC,
      targetCore: targetCoreC ?? undefined,
    }));
  }, [samples, targetDomeC, targetCoreC]);

  if (data.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Grafiek verschijnt zodra er metingen binnenkomen…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <CartesianChart
        data={data}
        xKey="min"
        yKeys={['ambient', 'meat', 'targetDome', 'targetCore']}
        domainPadding={{ top: 12, bottom: 12 }}
      >
        {({ points }) => (
          <>
            <Line
              points={points.targetDome}
              color={theme.colors.warn}
              strokeWidth={1}
              opacity={0.4}
            />
            {targetCoreC != null && (
              <Line
                points={points.targetCore}
                color={theme.colors.target}
                strokeWidth={1}
                opacity={0.4}
              />
            )}
            <Line
              points={points.ambient}
              color={theme.colors.ambient}
              strokeWidth={3}
              curveType="natural"
              animate={{ type: 'timing', duration: 300 }}
            />
            <Line
              points={points.meat}
              color={theme.colors.meat}
              strokeWidth={3}
              curveType="natural"
              animate={{ type: 'timing', duration: 300 }}
            />
          </>
        )}
      </CartesianChart>
      <View style={styles.legend}>
        <Legend color={theme.colors.ambient} label="Omgeving" />
        <Legend color={theme.colors.meat} label="Vlees" />
        <Legend color={theme.colors.warn} label={`Doel BBQ ${targetDomeC}°`} />
        {targetCoreC != null && (
          <Legend color={theme.colors.target} label={`Doel kern ${targetCoreC}°`} />
        )}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 240, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: 8 },
  empty: {
    height: 240,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: { color: theme.colors.textDim, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: theme.colors.textDim, fontSize: theme.font.small },
});
