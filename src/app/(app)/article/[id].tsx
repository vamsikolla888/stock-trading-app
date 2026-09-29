import { useLocalSearchParams, useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ExternalLink from 'lucide-react-native/icons/external-link';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { StockLogo } from '@/components/market/StockLogo';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InsightCard } from '@/components/ui/InsightCard';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { Section } from '@/components/ui/Section';
import { formatIstDateTime } from '@/features/home/lib/istTime';
import { stockLogoUrl } from '@/features/market/api';
import { useArticle, useRetryAnalysis } from '@/features/news/hooks';
import {
  formatExpectedMove,
  isArticleId,
  isWebLink,
  plainText,
  SENTIMENT_BADGE,
} from '@/features/news/lib/news';
import { openArticleLink } from '@/features/news/lib/openLink';
import type { AnalyzedArticleDetail } from '@/features/news/types';
import { stockHref } from '@/lib/navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

function LoadingBody() {
  return (
    <View accessibilityLabel="Loading article" className="gap-3">
      <View className="h-5 w-11/12 rounded bg-line dark:bg-line-dark" />
      <View className="h-5 w-3/4 rounded bg-line dark:bg-line-dark" />
      <View className="h-3 w-1/3 rounded bg-line dark:bg-line-dark" />
      <View className="mt-4 h-24 rounded-card bg-line dark:bg-line-dark" />
      <View className="h-32 rounded-card bg-line dark:bg-line-dark" />
    </View>
  );
}

function StockLink({ analysis }: { analysis: NonNullable<AnalyzedArticleDetail['analysis']> }) {
  const router = useRouter();
  const { colors } = useTheme();
  const symbol = analysis.stockSymbol;
  if (!symbol) return null;
  const exchange = analysis.exchange ?? 'NSE';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${symbol}${analysis.symbolVerified ? '' : ', ticker not verified'}`}
      onPress={() => router.push(stockHref(symbol, exchange))}
      className="mt-4 flex-row items-center gap-3 rounded-card border border-line bg-surface p-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={symbol} uri={stockLogoUrl(symbol)} size="sm" />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {symbol}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {exchange}
          {analysis.symbolVerified
            ? ' · the stock this article is about'
            : ' · ticker not verified'}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function AnalysisStatus({ detail, newsId }: { detail: AnalyzedArticleDetail; newsId: string }) {
  const retry = useRetryAnalysis();
  const status = detail.job?.status;

  if (status === 'failed') {
    return (
      <Banner
        className="mt-5"
        tone="error"
        title="Analysis failed"
        message={detail.job?.lastError ?? 'The model couldn’t score this article.'}
        action={{
          label: retry.isPending ? 'Retrying…' : 'Retry analysis',
          onPress: () => {
            if (!retry.isPending) retry.mutate(newsId);
          },
        }}
      />
    );
  }
  if (status === 'queued' || status === 'processing') {
    return (
      <Banner
        className="mt-5"
        tone="info"
        title="Analyzing…"
        message="This article’s sentiment analysis hasn’t finished yet. This screen checks again every few seconds."
      />
    );
  }
  if (!detail.job) {
    return (
      <Banner
        className="mt-5"
        tone="info"
        message="This article arrived before sentiment analysis was switched on, so it was never scored."
      />
    );
  }
  return null;
}

/** One analysed article: headline, the feed's summary, the model's tip and reasoning. */
export default function ArticleScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  // Article ids are Mongo ObjectIds; anything else can only be a broken link, so it is
  // "not found" straight away rather than a request the server rejects (or, with no id at
  // all, a disabled query that would show the skeleton forever).
  const newsId = isArticleId(params.id) ? params.id : '';
  const article = useArticle(newsId);
  const detail = article.data;
  const notFound =
    !newsId ||
    (isApiError(article.error) && (article.error.status === 404 || article.error.status === 422));
  const link = detail?.article.link;

  const footer =
    // StackScreen's safe area already covers the bottom inset beneath the footer.
    detail && isWebLink(link) ? (
      <View className="border-t border-line bg-surface px-5 py-3 dark:border-line-dark dark:bg-surface-dark">
        <ReadFullButton link={link} />
      </View>
    ) : undefined;

  let body: React.ReactNode;
  if (article.isPending && newsId) {
    body = <LoadingBody />;
  } else if (!detail) {
    body = notFound ? (
      <Banner
        tone="info"
        title="Article not found"
        message="It may have been removed from the news feed."
      />
    ) : (
      <InlineError
        what="this article"
        error={article.error}
        onRetry={() => void article.refetch()}
      />
    );
  } else {
    const { analysis } = detail;
    const published = formatIstDateTime(
      detail.article.publishedAtDate ?? detail.article.publishedAt,
    );
    const summary = plainText(detail.article.summary);
    const analysed = analysis ? formatIstDateTime(analysis.analyzedAt) : null;

    body = (
      <View>
        <Text
          accessibilityRole="header"
          className="text-[20px] font-bold leading-[27px] text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.4 }}
        >
          {detail.article.title || '(untitled)'}
        </Text>
        <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
          <Badge label={detail.article.source} />
          {published ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{published} IST</Text>
          ) : null}
        </View>

        {analysis ? <StockLink analysis={analysis} /> : null}
        <AnalysisStatus detail={detail} newsId={newsId} />

        {summary ? (
          <Section title="Summary" className="mt-6">
            <Text className="text-[14px] leading-[22px] text-ink dark:text-ink-dark">
              {summary}
            </Text>
          </Section>
        ) : null}

        {analysis ? (
          <>
            <InsightCard
              className="mt-6"
              kicker="Tip"
              title={analysis.tip}
              footnote="Informational only — not a directive to buy or sell."
            />

            <Section
              title="Analysis"
              right={
                <Badge label={analysis.sentiment} variant={SENTIMENT_BADGE[analysis.sentiment]} />
              }
            >
              <KpiGrid
                columns={3}
                items={[
                  { label: 'Sentiment', value: `${analysis.sentimentScore}/100` },
                  { label: 'Impact', value: `${analysis.effectivenessScore}/100` },
                  {
                    label: 'Next-day move',
                    value: formatExpectedMove(analysis.expectedMovementPercent),
                    trend: analysis.expectedMovementPercent,
                  },
                ]}
              />
              <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
                The next-day move is a model estimate, not a guarantee. Impact is how much the
                article should weigh on a decision.
              </Text>
              <Card className="mt-4">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  Reasoning
                </Text>
                <Text className="mt-1.5 text-[14px] leading-[21px] text-ink dark:text-ink-dark">
                  {analysis.reasoning}
                </Text>
              </Card>
            </Section>

            <Text className="mt-5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
              {analysed ? `Analysed ${analysed} IST · ` : ''}model {analysis.model}. Not investment
              advice.
            </Text>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <StackScreen
      title="Article"
      subtitle={detail?.article.source}
      onRefresh={newsId ? article.refetch : undefined}
      footer={footer}
    >
      {body}
    </StackScreen>
  );
}

function ReadFullButton({ link }: { link: string }) {
  const { colors } = useTheme();
  return (
    <Button
      label="Read full article"
      variant="outline"
      fullWidth
      rightIcon={<ExternalLink size={16} color={colors.text} />}
      accessibilityHint="Opens the original article in your browser"
      onPress={() => void openArticleLink(link)}
    />
  );
}
