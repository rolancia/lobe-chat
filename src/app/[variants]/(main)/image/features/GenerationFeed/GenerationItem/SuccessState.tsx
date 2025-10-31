'use client';

import { Block } from '@lobehub/ui';
import { memo } from 'react';
import { Flexbox } from 'react-layout-kit';

import ImageItem from '@/components/ImageItem';
import UsageInfo from '@/components/UsageInfo';

import { ActionButtons } from './ActionButtons';
import { useStyles } from './styles';
import { SuccessStateProps } from './types';
import { getThumbnailMaxWidth } from './utils';

// 成功状态组件
export const SuccessState = memo<SuccessStateProps>(
  ({
    generation,
    generationBatch,
    prompt,
    aspectRatio,
    onDelete,
    onDownload,
    onCopySeed,
    seedTooltip,
  }) => {
    const { styles } = useStyles();

    return (
      <Flexbox gap={8}>
        <Block
          align={'center'}
          className={styles.imageContainer}
          justify={'center'}
          style={{
            aspectRatio,
            maxWidth: getThumbnailMaxWidth(generation, generationBatch),
          }}
          variant={'filled'}
        >
          <ImageItem
            alt={prompt}
            preview={{
              src: generation.asset!.url,
            }}
            style={{ height: '100%', width: '100%' }}
            // Thumbnail quality is too bad
            url={generation.asset!.url}
          />
          <ActionButtons
            onCopySeed={onCopySeed}
            onDelete={onDelete}
            onDownload={onDownload}
            seedTooltip={seedTooltip}
            showCopySeed={!!generation.seed}
            showDownload
          />
        </Block>
        {generation.modelUsage && (
          <UsageInfo
            model={generationBatch.model}
            modelUsage={generation.modelUsage}
            provider={generationBatch.provider}
          />
        )}
      </Flexbox>
    );
  },
);

SuccessState.displayName = 'SuccessState';
