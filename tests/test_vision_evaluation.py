import unittest

from src.vision.evaluation import box_iou, match_counts, metrics


class DetectionEvaluationTests(unittest.TestCase):
    def test_duplicate_prediction_cannot_match_same_person_twice(self):
        predictions = [dict(bbox=[0, 0, 10, 10], confidence=c) for c in [0.8, 0.9]]
        self.assertEqual(match_counts(predictions, [[0, 0, 10, 10]]), (1, 1, 0))

    def test_missed_person_and_background_false_positive(self):
        self.assertEqual(match_counts([dict(bbox=[20, 20, 30, 30], confidence=0.9)],
                                     [[0, 0, 10, 10]]), (0, 1, 1))
        self.assertEqual(match_counts([], [[0, 0, 10, 10]]), (0, 0, 1))
        self.assertEqual(match_counts([], []), (0, 0, 0))

    def test_overlap_and_metric_denominators(self):
        self.assertAlmostEqual(box_iou([0, 0, 10, 10], [5, 0, 15, 10]), 1 / 3)
        self.assertEqual(metrics(0, 0, 0)['recall'], None)
        self.assertEqual(metrics(2, 1, 2)['f1'], 4 / 7)


if __name__ == '__main__':
    unittest.main()
